import { resolveTheme, shopColorsFromForm } from "@/lib/themes";
import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import Link from "next/link";
import AddressMap from "@/components/AddressMap";
import ThresholdLiveWarning from "@/components/admin/ThresholdLiveWarning";
import { PageShell, PageSection } from "@/components/ui";
import BrandColorField from "@/components/admin/BrandColorField";
import WaiverSettings from "./WaiverSettings";
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

  const featureOnlineBooking = formData.get("featureOnlineBooking") === "on";
  const featureWalkInPortal = formData.get("featureWalkInPortal") === "on";
  const featureEmailNotify = formData.get("featureEmailNotify") === "on";
  const featureSmsNotify = formData.get("featureSmsNotify") === "on";
  const featureRewards = formData.get("featureRewards") === "on";

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
      featureOnlineBooking,
      featureWalkInPortal,
      featureEmailNotify,
      featureSmsNotify,
      featureRewards,
      rewardVisitsPerReward,
      rewardLabel,
      rewardValueCents,
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
}: {
  name: string;
  label: string;
  description: string;
  checked: boolean;
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
    </div>
  );
}

interface PageProps {
  searchParams: Promise<{ saved?: string; error?: string; waiverSaved?: string; waiverError?: string; version?: string; bumped?: string; restored?: string }>;
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

          <Field name="shopWebsite" label="Website">
            <input type="url" id="shopWebsite" name="shopWebsite" defaultValue={config?.shopWebsite ?? ""} placeholder="https://your-domain.example" className={FIELD} />
          </Field>
        </Section>



        <Section title="Features" hint="What the shop offers. Each one can be switched off without losing the data behind it.">
          <div className="-mt-2">
            <FeatureToggle
              name="featureOnlineBooking"
              label="Online Booking"
              description="Allow customers to book appointments through the online booking portal."
              checked={config?.featureOnlineBooking ?? false}
            />
            <FeatureToggle
              name="featureWalkInPortal"
              label="Walk-In Check-In Portal"
              description="Display a self-service kiosk screen for walk-in customers to register their arrival."
              checked={config?.featureWalkInPortal ?? false}
            />
            <FeatureToggle
              name="featureEmailNotify"
              label="Email Notifications"
              description="Send automated email reminders and confirmations to customers."
              checked={config?.featureEmailNotify ?? false}
            />
            <FeatureToggle
              name="featureSmsNotify"
              label="SMS Notifications"
              description="Send automated SMS reminders to customers. Twilio credentials are entered on the Notifications page."
              checked={config?.featureSmsNotify ?? false}
            />
            <FeatureToggle
              name="featureRewards"
              label="Customer Rewards"
              description="A punch card: every finished visit is a punch, and a set number of them earns a reward staff hand over at the counter."
              checked={config?.featureRewards ?? false}
            />
          </div>
          <p className="text-xs text-stone-500 border-t border-stone-100 pt-3">
            The liability waiver is switched on and off in the{" "}
            <Link href="#liability-waiver" className="text-amber-700 hover:text-amber-900 underline">
              Liability Waiver
            </Link>{" "}
            section below, alongside its text and version. The sender address and Twilio credentials live on{" "}
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
          title="Scheduling"
          hint="Used by the rota to flag a week before it is worked, while it can still be changed."
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
      <WaiverSettings searchParams={props.searchParams} />
    </PageShell>
  );
}
