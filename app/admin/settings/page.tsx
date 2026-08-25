import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import Link from "next/link";
import AddressMap from "@/components/AddressMap";
import { PageShell, PageSection } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Shop settings" };

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

  const shopName = formData.get("shopName") as string;
  const shopTagline = formData.get("shopTagline") as string;
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

  revalidatePath("/admin/settings");
  revalidatePath("/portal");
  revalidatePath("/staff/customers");
  redirect("/admin/settings?saved=1");
}

const FIELD =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <PageSection title={title} bodyClassName="space-y-5">
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
    <div className="flex items-start gap-3 py-4 border-b border-stone-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-stone-800">{label}</p>
        <p className="text-sm text-stone-500 mt-0.5">{description}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer mt-0.5">
        <input type="checkbox" name={name} defaultChecked={checked} className="sr-only peer" />
        <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700" />
      </label>
    </div>
  );
}

interface PageProps {
  searchParams: { saved?: string };
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const config = await getConfig();

  return (
    <PageShell
      title="Shop Settings"
      subtitle="Your shop's details, the features it runs, and the numbers behind them."
    >

      {searchParams.saved === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Settings saved successfully.
        </p>
      )}

      <form action={saveSettings}>
        <Section title="Shop Information">
          <Field name="shopName" label="Shop Name" hint="Used across the public site, emails and the staff screens.">
            <input type="text" id="shopName" name="shopName" defaultValue={config?.shopName ?? ""} placeholder="Your Grooming Shop" className={FIELD} />
          </Field>

          <Field
            name="shopTagline"
            label="Tagline"
            hint="The line under the shop name on the public home page. Leave it empty to show no tagline at all."
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
            The liability waiver is switched on and off on the{" "}
            <Link href="/admin/waiver" className="text-amber-700 hover:text-amber-900 underline">
              Liability Waiver
            </Link>{" "}
            page, alongside its text and version. The sender address and Twilio credentials live on{" "}
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

          <Field name="lateArrivalMissedMins" label="Missed after (mins)" hint="Treated as a no-show on the floor screens.">
            <input type="number" id="lateArrivalMissedMins" name="lateArrivalMissedMins" defaultValue={config?.lateArrivalMissedMins ?? 30} min={1} max={480} className={FIELD} />
          </Field>

          <p className="text-xs text-stone-500 border-t border-stone-100 pt-3">
            These escalate, so each has to be later than the one above it. A value that would invert
            the order is nudged up on save rather than accepted.
          </p>
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
        </Section>

        <PageSection tone="muted" bodyClassName="flex justify-end">
          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Save settings
          </button>
        </PageSection>
      </form>
    </PageShell>
  );
}
