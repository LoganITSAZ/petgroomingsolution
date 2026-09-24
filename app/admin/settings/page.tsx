import { resolveTheme, shopColorsFromForm } from "@/lib/themes";
import { getConfig } from "@/lib/config";
import { FEATURES, featureBlockers, featuresByGroup, type FeatureKey } from "@/lib/features";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import Link from "next/link";
import AddressMap from "@/components/AddressMap";
import ThresholdLiveWarning from "@/components/admin/ThresholdLiveWarning";
import { PageShell, PageSection } from "@/components/ui";
import BrandColorField from "@/components/admin/BrandColorField";
import DocumentSettings from "./DocumentSettings";
import VaccineRequirements from "./VaccineRequirements";
import SaveToast from "@/components/SaveToast";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Shop Settings" };

/**
 * Everything the shop decides about itself, on one page: who it is, which
 * features are switched on, and the numbers those features run on.
 *
 * Feature flags used to live on a separate /admin/features screen. Whether
 * online booking is on is a shop setting like any other, and splitting them
 * meant the booking window sat on one page while the flag that governs it sat
 * on another. One page, one form, one save.
 */

async function saveSettings(formData: FormData) {
  "use server";

  await requireManager();

  const themeShopColors = shopColorsFromForm(formData);
  if (!themeShopColors) {
    redirect("/admin/settings?error=bad_color#shop-branding");
  }

  const shopName = formData.get("shopName") as string;
  const shopTagline = String(formData.get("shopTagline") ?? "").trim() || null;
  const shopPhone = formData.get("shopPhone") as string;
  const shopEmail = formData.get("shopEmail") as string;
  const shopAddress = formData.get("shopAddress") as string;
  const shopWebsite = formData.get("shopWebsite") as string;
  /*
   * The address in parts. Blank is the normal state: lib/seo.ts reads the city
   * and state out of the address line above, and these three only exist for an
   * address that does not parse into "street, city, ST ZIP".
   */
  const shopCity = String(formData.get("shopCity") ?? "").trim() || null;
  const shopRegion = String(formData.get("shopRegion") ?? "").trim() || null;
  const shopPostalCode = String(formData.get("shopPostalCode") ?? "").trim() || null;

  /*
   * The switches this form owns, read from the registry rather than named
   * five times. The documents flag is declared in the registry too but lives
   * on the Documents section with the text, so it is not posted here and must not
   * be written from an absent checkbox.
   */
  const postedFlags = Object.fromEntries(
    FEATURES.filter((feature) => feature.key !== "featureWaiverRequired").map((feature) => [
      feature.key,
      formData.get(feature.key) === "on",
    ])
  ) as Record<Exclude<FeatureKey, "featureWaiverRequired">, boolean>;

  // A punch card that needs zero visits would hand out a reward every visit.
  const rewardVisitsPerReward = Math.max(
    1,
    parseInt((formData.get("rewardVisitsPerReward") as string) ?? "8", 10) || 8
  );
  const rewardLabel =
    ((formData.get("rewardLabel") as string) ?? "").trim() || "A free nail trim";
  // Typed in dollars, stored in cents like every other price in the app.
  const rewardValueCents = Math.max(
    0,
    Math.round((parseFloat((formData.get("rewardValueDollars") as string) ?? "10") || 0) * 100)
  );

  // Both sets of flags escalate, so the thresholds have to stay in order — a
  // mis-typed middle value must not invert them.
  const lateArrivalWatchMins = Math.max(0, parseInt((formData.get("lateArrivalWatchMins") as string) ?? "5", 10) || 5);
  const lateArrivalLateMins = Math.max(lateArrivalWatchMins + 1, parseInt((formData.get("lateArrivalLateMins") as string) ?? "15", 10) || 15);
  const lateArrivalMissedMins = Math.max(lateArrivalLateMins + 1, parseInt((formData.get("lateArrivalMissedMins") as string) ?? "30", 10) || 30);

  const pickupWatchMins = Math.max(1, parseInt((formData.get("pickupWatchMins") as string) ?? "60", 10) || 60);
  const pickupLateMins = Math.max(pickupWatchMins + 1, parseInt((formData.get("pickupLateMins") as string) ?? "120", 10) || 120);
  const pickupCriticalMins = Math.max(pickupLateMins + 1, parseInt((formData.get("pickupCriticalMins") as string) ?? "240", 10) || 240);

  // Grace forgives a lapse, so a negative one is meaningless; a year of it is
  // no gate at all.
  const vaccinationGateBlocks = formData.get("vaccinationGateBlocks") === "on";
  const vaccinationGraceDays = Math.min(
    365,
    Math.max(0, parseInt((formData.get("vaccinationGraceDays") as string) ?? "0", 10) || 0)
  );

  // A reminder the same hour as the visit is not a reminder; a month out is
  // not either. Both ends are clamped rather than trusted.
  const reminderHoursBefore = Math.min(
    336,
    Math.max(1, parseInt((formData.get("reminderHoursBefore") as string) ?? "24", 10) || 24)
  );

  // Grace past a household's own cadence. Zero is a fair answer -- chase the
  // day they are late -- so only the top end is a guess worth clamping.
  const rebookingGraceDays = Math.min(
    120,
    Math.max(0, parseInt((formData.get("rebookingGraceDays") as string) ?? "7", 10) || 0)
  );

  // Shop-local hour the morning brief goes out. Clamped to a real hour rather
  // than rejected: a mis-typed 25 should send late, never go silent.
  const digestHour = Math.min(
    23,
    Math.max(0, parseInt((formData.get("digestHour") as string) ?? "7", 10) || 0)
  );

  // How many households hear about one cancelled slot, and how far either side
  // of their own date it still counts as theirs. Both floor at 1: zero of
  // either is the feature switched off, which is what the flag is for.
  const slotOfferMaxRecipients = Math.min(
    25,
    Math.max(1, parseInt((formData.get("slotOfferMaxRecipients") as string) ?? "5", 10) || 5)
  );
  const slotOfferWindowDays = Math.min(
    60,
    Math.max(1, parseInt((formData.get("slotOfferWindowDays") as string) ?? "10", 10) || 10)
  );

  // A zero-hour week would mark every shift overtime.
  const overtimeWeeklyHours = Math.min(
    168,
    Math.max(1, parseInt((formData.get("overtimeWeeklyHours") as string) ?? "40", 10) || 40)
  );

  const bookingLeadHours = parseInt((formData.get("bookingLeadHours") as string) ?? "2", 10);
  const bookingWindowDays = parseInt((formData.get("bookingWindowDays") as string) ?? "30", 10);
  const walkInWindowStart = formData.get("walkInWindowStart") as string;
  const walkInWindowEnd = formData.get("walkInWindowEnd") as string;

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: {
      themeShopColors,
      shopName,
      shopTagline,
      shopPhone,
      shopEmail,
      shopAddress,
      shopWebsite,
      shopCity,
      shopRegion,
      shopPostalCode,
      ...postedFlags,
      rewardVisitsPerReward,
      rewardLabel,
      rewardValueCents,
      vaccinationGateBlocks,
      vaccinationGraceDays,
      reminderHoursBefore,
      rebookingGraceDays,
      digestHour,
      slotOfferMaxRecipients,
      slotOfferWindowDays,
      overtimeWeeklyHours,
      bookingLeadHours,
      bookingWindowDays,
      walkInWindowStart,
      walkInWindowEnd,
      lateArrivalWatchMins,
      lateArrivalLateMins,
      lateArrivalMissedMins,
      pickupWatchMins,
      pickupLateMins,
      pickupCriticalMins,
    },
  });

  revalidatePath("/", "layout");
  revalidatePath("/admin/appearance");
  revalidatePath("/admin/settings");
  revalidatePath("/portal");
  revalidatePath("/staff/customers");
  redirect("/admin/settings?saved=1");
}

const FIELD =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm ";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <PageSection title={title} bodyClassName="space-y-3">
      {hint && <p className="text-sm text-stone-500">{hint}</p>}
      {children}
    </PageSection>
  );
}

function Field({
  name,
  label,
  hint,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 items-start">
      <label htmlFor={name} className="text-sm font-medium text-stone-700 pt-2">
        {label}
      </label>
      <div className="col-span-2">
        {children}
        {hint && <p className="text-xs text-stone-400 mt-1">{hint}</p>}
      </div>
    </div>
  );
}

function FeatureToggle({
  name,
  label,
  description,
  checked,
  blockers = [],
}: {
  name: string;
  label: string;
  description: string;
  checked: boolean;
  blockers?: string[];
}) {
  return (
    /* The <label> has to hold the name, not sit empty beside it: wrapping only
       the checkbox and its switch graphic left the control announced as
       "checkbox, unchecked" with nothing to say which feature it was. The row
       is the label now, and the description hangs off it by aria-describedby
       so it is read second rather than folded into the name. */
    <div className="py-2 border-b border-stone-100 last:border-0">
      <label className="flex items-start gap-3 cursor-pointer">
        <span className="flex-1 text-sm font-medium text-stone-800">{label}</span>
        <span className="relative inline-flex flex-none items-center mt-0.5">
          <input
            type="checkbox"
            name={name}
            defaultChecked={checked}
            aria-describedby={`${name}-description`}
            className="sr-only peer"
          />
          <span className="block w-11 h-6 bg-stone-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-stone-900 dark:peer-focus-visible:outline-stone-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700" />
        </span>
      </label>
      <p id={`${name}-description`} className="text-sm text-stone-500 mt-0.5">
        {description}
      </p>
      {blockers.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
          Not live: {blockers.join(" ")}
        </p>
      )}
    </div>
  );
}

interface PageProps {
  searchParams: Promise<{ saved?: string; error?: string; vaccineSaved?: string; vaccineRetired?: string; vaccineRestored?: string; vaccineError?: string; waiverSaved?: string; waiverError?: string; version?: string; bumped?: string; restored?: string }>;
}

export default async function SettingsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const config = await getConfig();

  return (
    <PageShell
      title="Shop Settings"
      className="shop-settings"
      subtitle="Your shop's details, the features it runs, and the numbers behind them."
    >

      {searchParams.saved === "1" && (
        <SaveToast>
          Settings saved successfully.
        </SaveToast>
      )}

      {searchParams.error === "bad_color" && <SaveToast tone="error">Enter every color as #rrggbb.</SaveToast>}
      <form action={saveSettings} className="grid items-start lg:grid-cols-2">
        <Section title="Shop Information">
          <Field name="shopName" label="Shop Name" hint="Used across the public site, emails and the staff screens.">
            <input type="text" id="shopName" name="shopName" defaultValue={config?.shopName ?? ""} placeholder="Your Grooming Shop" className={FIELD} />
          </Field>

          <Field
            name="shopTagline"
            label="Tagline"
            hint="Shown under the shop name on the home page and in the banner across public pages. Leave blank to hide both."
          >
            <input type="text" id="shopTagline" name="shopTagline" defaultValue={config?.shopTagline ?? ""} placeholder="The best and bubbliest groomer in town" className={FIELD} />
          </Field>

          <Field name="shopPhone" label="Phone Number">
            <input type="tel" id="shopPhone" name="shopPhone" defaultValue={config?.shopPhone ?? ""} placeholder="(555) 123-4567" className={FIELD} />
          </Field>

          <Field name="shopEmail" label="Email Address">
            <input type="email" id="shopEmail" name="shopEmail" defaultValue={config?.shopEmail ?? ""} placeholder="hello@example.com" className={FIELD} />
          </Field>

          <Field name="shopAddress" label="Address">
            <textarea id="shopAddress" name="shopAddress" defaultValue={config?.shopAddress ?? ""} placeholder="123 Main St, Springfield, IL 62701" rows={3} className={`${FIELD} resize-none`} />
          </Field>

          {config?.shopAddress && (
            <div className="grid grid-cols-3 gap-3 items-start">
              <p className="text-sm font-medium text-stone-700 pt-2">On the map</p>
              <div className="col-span-2">
                {/* Confirms the saved address resolves to the right place. */}
                <AddressMap
                  address={config.shopAddress}
                  title="Map showing the saved shop address"
                  height={180}
                  compact
                />
                <p className="text-xs text-stone-400 mt-1">
                  Where the address above lands. Save a correction if this is not the shop.
                </p>
              </div>
            </div>
          )}

          <Field name="shopWebsite" label="Live website URL">
            <input type="url" id="shopWebsite" name="shopWebsite" defaultValue={config?.shopWebsite ?? ""} placeholder="https://your-domain.example" className={FIELD} />
            <p className="mt-1 text-xs text-muted">
              Used for search listings, canonical links, the sitemap, and social previews. Enter this site’s public URL. Everything else search engines are told is set on{" "}
              <Link href="/admin/marketing#search" className="underline">Marketing</Link>.
            </p>
          </Field>

          <details className="disclosure">
            <summary className="text-sm font-medium text-stone-700">Correct the city, state and ZIP</summary>
            <p className="mt-2 text-xs text-muted">
              Search engines are told the city and state read out of the address above. Fill these in only if{" "}
              <Link href="/admin/marketing#search" className="underline">Marketing</Link> shows the wrong place.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-stone-500">City</span>
                <input name="shopCity" defaultValue={config?.shopCity ?? ""} className={FIELD} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-stone-500">State</span>
                <input name="shopRegion" defaultValue={config?.shopRegion ?? ""} className={FIELD} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-stone-500">ZIP</span>
                <input name="shopPostalCode" defaultValue={config?.shopPostalCode ?? ""} className={FIELD} />
              </label>
            </div>
          </details>
        </Section>



        <Section title="Features" hint="What the shop offers. Each one can be switched off without losing the data behind it.">
          <div className="-mt-2">
            {featuresByGroup()
              // The documents flag is declared in the registry but owned by the
              // Documents section below, so its group renders nothing and must
              // not leave an empty div behind.
              .map(({ group, features }) => ({
                group,
                features: features.filter((feature) => feature.key !== "featureWaiverRequired"),
              }))
              .filter(({ features }) => features.length > 0)
              .map(({ group, features }) => (
                <div key={group}>
                  {features.map((feature) => (
                    <FeatureToggle
                      key={feature.key}
                      name={feature.key}
                      label={feature.label}
                      description={feature.blurb}
                      checked={config?.[feature.key] ?? false}
                      blockers={config ? featureBlockers(config, feature.key) : []}
                    />
                  ))}
                </div>
              ))}
          </div>
          <p className="text-xs text-stone-500 border-t border-stone-100 pt-3">
            The documents customers sign are switched on and off in the{" "}
            <Link href="#shop-documents" className="text-amber-700 hover:text-amber-900 underline">
              Documents
            </Link>{" "}
            section below, alongside their text and versions. The sender address and Twilio credentials live on{" "}
            <Link href="/admin/notifications" className="text-amber-700 hover:text-amber-900 underline">
              Notifications
            </Link>
            .
          </p>
        </Section>

        <Section title="Rewards">
          <Field
            name="rewardVisitsPerReward"
            label="Visits per reward"
            hint="How many finished visits earn one reward. Changing this re-reads every card from the visits already on file — nobody loses their history."
          >
            <input type="number" id="rewardVisitsPerReward" name="rewardVisitsPerReward" defaultValue={config?.rewardVisitsPerReward ?? 8} min={1} max={100} className={FIELD} />
          </Field>

          <Field
            name="rewardValueDollars"
            label="What a reward is worth"
            hint="Taken off the bill in cash when it is redeemed against a visit. A reward can never take a bill below zero, and the amount is snapshotted onto the visit — changing this never reprices a visit already quoted."
          >
            <div className="flex items-center gap-1.5">
              <span className="text-stone-500">$</span>
              <input
                type="number"
                id="rewardValueDollars"
                name="rewardValueDollars"
                defaultValue={((config?.rewardValueCents ?? 1000) / 100).toFixed(2)}
                min={0}
                step="0.5"
                className={FIELD}
              />
            </div>
          </Field>

          <Field
            name="rewardLabel"
            label="What they earn"
            hint="Shown to the customer on their card and to staff at the counter. Each redemption records the wording in force at the time."
          >
            <input type="text" id="rewardLabel" name="rewardLabel" defaultValue={config?.rewardLabel ?? ""} placeholder="A free nail trim" className={FIELD} />
          </Field>

          <p className="text-xs text-stone-500 border-t border-stone-100 pt-3">
            Punches are counted from finished visits whether or not this is switched on, so turning
            it on does not start your regulars back at zero. A visit cancelled or marked a no-show
            after it was finished gives its punch back.
          </p>
        </Section>

        <Section
          title="Vaccinations"
          hint="What the shop checks is a list of requirements, edited below. These two decide what happens to a pet that is not current."
        >
          <FeatureToggle
            name="vaccinationGateBlocks"
            label="Refuse a booking for a lapsed pet"
            description="Off, an online booking goes through and the shop is warned on the visit. On, the portal refuses it and tells the owner to bring proof. Staff at the counter are never refused either way — somebody standing in front of you with a certificate in their hand is not an exception to code for."
            checked={config?.vaccinationGateBlocks ?? false}
          />

          <Field
            name="vaccinationGraceDays"
            label="Grace after expiry (days)"
            hint="How far past an expiry the shop will still take a booking, for an owner who is on their way to the vet. It moves what is refused, not what is shown: a lapsed pet still reads as lapsed on every screen."
          >
            <input type="number" id="vaccinationGraceDays" name="vaccinationGraceDays" defaultValue={config?.vaccinationGraceDays ?? 0} min={0} max={365} className={FIELD} />
          </Field>

          <p className="text-xs text-stone-500 border-t border-stone-100 pt-3">
            A pet with nothing on file is refused outright when the switch above is on — there is no
            lapse to forgive. Add or retire what the shop checks in{" "}
            <Link href="#vaccinations" className="text-amber-700 hover:text-amber-900 underline">
              What The Shop Checks
            </Link>
            , below. Each pet’s own certificates and expiry dates live on its profile.
          </p>
        </Section>

        <Section
          title="Reminders"
          hint="The day-before reminder, sent by the shop's job runner rather than by anyone at the counter."
        >
          <Field
            name="reminderHoursBefore"
            label="Remind this far ahead (hours)"
            hint="A visit closer than the booking lead time above is skipped — an hour's notice is noise. A reminder is sent once per visit, so a runner that restarts never says it twice."
          >
            <input type="number" id="reminderHoursBefore" name="reminderHoursBefore" defaultValue={config?.reminderHoursBefore ?? 24} min={1} max={336} className={FIELD} />
          </Field>

          <p className="text-xs text-stone-500 border-t border-stone-100 pt-3">
            Reminders go out on whichever channels are live — email, text, or both. Switch the
            reminder itself off in Features above.
          </p>
        </Section>

        <Section
          title="Rebooking"
          hint="Who has drifted, measured against their own history rather than a shop-wide interval."
        >
          <Field
            name="rebookingGraceDays"
            label="Chase this long after they are due (days)"
            hint="A household that books every eight weeks is not overdue on day 57. Nothing is said about a customer with fewer than three visits on file — a cadence from two is noise."
          >
            <input type="number" id="rebookingGraceDays" name="rebookingGraceDays" defaultValue={config?.rebookingGraceDays ?? 7} min={0} max={120} className={FIELD} />
          </Field>

          <Field
            name="slotOfferWindowDays"
            label="Offer a cancelled slot this far from their own date (days)"
            hint="A cancellation is only worth mentioning to a household the slot roughly suits. Measured either side of the date their own cadence points at, so a customer already a week overdue is as good a match as one due next week."
          >
            <input type="number" id="slotOfferWindowDays" name="slotOfferWindowDays" defaultValue={config?.slotOfferWindowDays ?? 10} min={1} max={60} className={FIELD} />
          </Field>

          <Field
            name="slotOfferMaxRecipients"
            label="Tell this many households about one free slot"
            hint="First come, first served — the message says so. Too few and the slot stays empty; too many and most of them are told about something that has gone."
          >
            <input type="number" id="slotOfferMaxRecipients" name="slotOfferMaxRecipients" defaultValue={config?.slotOfferMaxRecipients ?? 5} min={1} max={25} className={FIELD} />
          </Field>

          <p className="text-xs text-stone-500 border-t border-stone-100 pt-3">
            The call list is{" "}
            <Link href="/staff/appointments?group=rebook" className="text-amber-700 hover:text-amber-900 underline">
              Due to rebook
            </Link>{" "}
            on the appointments board. A nudge goes out once per finished visit, between 9am and 5pm shop time, on whichever
            channels are live — a shop with none still works the list by phone.
          </p>
        </Section>

        <Section
          title="Morning Brief"
          hint="The day's alerts and the shop's patterns, mailed to whoever runs the shop before they open the dashboard."
        >
          <Field
            name="digestHour"
            label="Send at (shop time, 0–23)"
            hint="Sent once per shop day, on the first run at or after this hour. A brief that is late still arrives; it never arrives twice."
          >
            <input type="number" id="digestHour" name="digestHour" defaultValue={config?.digestHour ?? 7} min={0} max={23} className={FIELD} />
          </Field>

          <p className="text-xs text-stone-500 border-t border-stone-100 pt-3">
            It carries exactly what the dashboard carries, snoozed insights included — an
            observation put away yesterday does not arrive by email today. Switch the brief itself
            off in Features above.
          </p>
        </Section>

        <Section
          title="Scheduling"
          hint="Used by the schedule to flag a week before it is worked, while it can still be changed."
        >
          <Field
            name="overtimeWeeklyHours"
            label="Overtime after (hours/week)"
            hint="Scheduled hours past this read as overtime on the schedule; within four hours of it reads as close. Federal FLSA overtime is 40."
          >
            <input type="number" id="overtimeWeeklyHours" name="overtimeWeeklyHours" defaultValue={config?.overtimeWeeklyHours ?? 40} min={1} max={168} className={FIELD} />
          </Field>
        </Section>

        <Section title="Booking Window">
          <Field name="bookingLeadHours" label="Booking Lead Time (hours)" hint="Minimum hours in advance a customer must book an appointment.">
            <input type="number" id="bookingLeadHours" name="bookingLeadHours" defaultValue={config?.bookingLeadHours ?? 2} min={0} max={168} className={FIELD} />
          </Field>

          <Field name="bookingWindowDays" label="Booking Window (days)" hint="How many days ahead customers can schedule an appointment.">
            <input type="number" id="bookingWindowDays" name="bookingWindowDays" defaultValue={config?.bookingWindowDays ?? 30} min={1} max={365} className={FIELD} />
          </Field>
        </Section>

        <Section
          title="Walk-In Acceptance Window"
          hint="The daily time range during which walk-in check-ins are accepted. Read as shop time, and the end is exclusive."
        >
          <Field name="walkInWindowStart" label="Window Start">
            <input type="time" id="walkInWindowStart" name="walkInWindowStart" defaultValue={config?.walkInWindowStart ?? "09:00"} className={FIELD} />
          </Field>

          <Field name="walkInWindowEnd" label="Window End">
            <input type="time" id="walkInWindowEnd" name="walkInWindowEnd" defaultValue={config?.walkInWindowEnd ?? "16:00"} className={FIELD} />
          </Field>
        </Section>

        <Section
          title="Late Arrivals"
          hint="When a booked pet that has not arrived turns amber, orange and red on the schedule. Minutes past the booked time."
        >
          <Field name="lateArrivalWatchMins" label="Watch after (mins)" hint="First nudge — worth a glance, not a call.">
            <input type="number" id="lateArrivalWatchMins" name="lateArrivalWatchMins" defaultValue={config?.lateArrivalWatchMins ?? 5} min={0} max={240} className={FIELD} />
          </Field>

          <Field name="lateArrivalLateMins" label="Late after (mins)" hint="Someone should be phoning the owner.">
            <input type="number" id="lateArrivalLateMins" name="lateArrivalLateMins" defaultValue={config?.lateArrivalLateMins ?? 15} min={1} max={480} className={FIELD} />
          </Field>

          <Field name="lateArrivalMissedMins" label="Missed after (mins)" hint="Treated as a no-show on the storefront screens.">
            <input type="number" id="lateArrivalMissedMins" name="lateArrivalMissedMins" defaultValue={config?.lateArrivalMissedMins ?? 30} min={1} max={480} className={FIELD} />
          </Field>

          <p className="text-xs text-stone-500 border-t border-stone-100 pt-3">
            These escalate, so each has to be later than the one above it. A value that would invert
            the order is nudged up on save rather than accepted.
          </p>
          <ThresholdLiveWarning
            fieldIds={["lateArrivalWatchMins", "lateArrivalLateMins", "lateArrivalMissedMins"]}
            message="These will be reordered on save to keep watch < late < missed."
          />
        </Section>

        <Section
          title="Pickup Waits"
          hint="How long a finished pet may wait for collection before the wait is flagged. Minutes since the pet was ready."
        >
          <Field name="pickupWatchMins" label="Watch after (mins)" hint="Also the point at which a waiting pet counts against kennel capacity.">
            <input type="number" id="pickupWatchMins" name="pickupWatchMins" defaultValue={config?.pickupWatchMins ?? 60} min={1} max={720} className={FIELD} />
          </Field>

          <Field name="pickupLateMins" label="Late after (mins)">
            <input type="number" id="pickupLateMins" name="pickupLateMins" defaultValue={config?.pickupLateMins ?? 120} min={2} max={1440} className={FIELD} />
          </Field>

          <Field name="pickupCriticalMins" label="Critical after (mins)">
            <input type="number" id="pickupCriticalMins" name="pickupCriticalMins" defaultValue={config?.pickupCriticalMins ?? 240} min={3} max={1440} className={FIELD} />
          </Field>

          <ThresholdLiveWarning
            fieldIds={["pickupWatchMins", "pickupLateMins", "pickupCriticalMins"]}
            message="These will be reordered on save to keep watch < late < critical."
          />
        </Section>

        <div id="shop-branding" className="scroll-mt-4 lg:col-span-2">
          <Section title="Shop Branding">
            <BrandColorField
              initialTokens={resolveTheme({ ...config, themeAutoSeasonal: false, themeUseShopColors: true }, { month: 1, day: 1 }).tokens}
              shopName={config.shopName}
            />
          </Section>
        </div>

        <PageSection tone="muted" className="lg:col-span-2" bodyClassName="flex justify-end">
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Save settings
          </button>
        </PageSection>
      </form>
      <VaccineRequirements searchParams={props.searchParams} />
      <DocumentSettings searchParams={props.searchParams} />
    </PageShell>
  );
}
