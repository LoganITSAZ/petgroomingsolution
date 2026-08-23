import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

async function saveFeatures(formData: FormData) {
  "use server";

  const featureOnlineBooking = formData.get("featureOnlineBooking") === "on";
  const featureWalkInPortal = formData.get("featureWalkInPortal") === "on";
  const featureEmailNotify = formData.get("featureEmailNotify") === "on";
  const featureSmsNotify = formData.get("featureSmsNotify") === "on";

  const bookingLeadHours = parseInt(
    (formData.get("bookingLeadHours") as string) ?? "2",
    10
  );
  const bookingWindowDays = parseInt(
    (formData.get("bookingWindowDays") as string) ?? "30",
    10
  );
  const walkInWindowStart = formData.get("walkInWindowStart") as string;
  const walkInWindowEnd = formData.get("walkInWindowEnd") as string;

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: {
      featureOnlineBooking,
      featureWalkInPortal,
      featureEmailNotify,
      featureSmsNotify,
      bookingLeadHours,
      bookingWindowDays,
      walkInWindowStart,
      walkInWindowEnd,
    },
  });

  revalidatePath("/admin/features");
  redirect("/admin/features?saved=1");
}

interface FeatureToggleProps {
  name: string;
  label: string;
  description: string;
  checked: boolean;
}

function FeatureToggle({ name, label, description, checked }: FeatureToggleProps) {
  return (
    <div className="flex items-start gap-4 py-4 border-b border-stone-100 last:border-0">
      <div className="flex-1">
        <p className="text-sm font-medium text-stone-800">{label}</p>
        <p className="text-sm text-stone-500 mt-0.5">{description}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer mt-0.5">
        <input
          type="checkbox"
          name={name}
          defaultChecked={checked}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700" />
      </label>
    </div>
  );
}

interface PageProps {
  searchParams: { saved?: string };
}

export default async function FeaturesPage({ searchParams }: PageProps) {
  const config = await getConfig();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Feature Flags</h1>
        <p className="text-sm text-stone-500 mt-1">
          Enable or disable features for your shop and configure their behaviour.
        </p>
      </div>

      {searchParams.saved === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-green-800 text-sm font-medium">
          Feature settings saved successfully.
        </div>
      )}

      <form action={saveFeatures}>
        {/* Feature Toggles */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3 mb-2">
            Features
          </h2>

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
            description="Send automated SMS reminders to customers. Requires Twilio credentials configured in Notifications."
            checked={config?.featureSmsNotify ?? false}
          />
        </div>

        <p className="text-sm text-stone-500 mt-3">
          The liability waiver is switched on and off on the{" "}
          <Link href="/admin/waiver" className="text-amber-700 hover:text-amber-900 underline">
            Liability Waiver
          </Link>{" "}
          page, alongside its text and version.
        </p>

        {/* Booking Settings */}
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5 mt-6">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3">
            Booking Window Settings
          </h2>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Booking Lead Time (hours)
            </label>
            <div className="col-span-2">
              <input
                type="number"
                name="bookingLeadHours"
                defaultValue={config?.bookingLeadHours ?? 2}
                min={0}
                max={168}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-xs text-stone-400 mt-1">
                Minimum hours in advance a customer must book an appointment.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Booking Window (days)
            </label>
            <div className="col-span-2">
              <input
                type="number"
                name="bookingWindowDays"
                defaultValue={config?.bookingWindowDays ?? 30}
                min={1}
                max={365}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-xs text-stone-400 mt-1">
                How many days ahead customers can schedule an appointment.
              </p>
            </div>
          </div>
        </div>

        {/* Walk-In Window */}
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5 mt-6">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3">
            Walk-In Acceptance Window
          </h2>
          <p className="text-sm text-stone-500 -mt-2">
            Set the daily time range during which walk-in check-ins are accepted.
          </p>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Window Start
            </label>
            <div className="col-span-2">
              <input
                type="time"
                name="walkInWindowStart"
                defaultValue={config?.walkInWindowStart ?? "09:00"}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Window End
            </label>
            <div className="col-span-2">
              <input
                type="time"
                name="walkInWindowEnd"
                defaultValue={config?.walkInWindowEnd ?? "16:00"}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Save Features
          </button>
        </div>
      </form>
    </div>
  );
}
