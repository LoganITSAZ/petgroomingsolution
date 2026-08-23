import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function saveNotifications(formData: FormData) {
  "use server";

  const emailFromName = formData.get("emailFromName") as string;
  const emailFromAddress = formData.get("emailFromAddress") as string;
  const featureEmailNotify = formData.get("featureEmailNotify") === "on";
  const twilioAccountSid = formData.get("twilioAccountSid") as string;
  const twilioAuthToken = formData.get("twilioAuthToken") as string;
  const twilioFromNumber = formData.get("twilioFromNumber") as string;
  const featureSmsNotify = formData.get("featureSmsNotify") === "on";

  const data: Record<string, unknown> = {
    emailFromName,
    emailFromAddress,
    featureEmailNotify,
    featureSmsNotify,
    twilioAccountSid,
    twilioFromNumber,
  };

  // Only update auth token if a new value was provided (avoid blanking a stored secret)
  if (twilioAuthToken.trim() !== "") {
    data.twilioAuthToken = twilioAuthToken;
  }

  await prisma.systemConfig.update({
    where: { id: "global" },
    data,
  });

  revalidatePath("/admin/notifications");
  redirect("/admin/notifications?saved=1");
}

interface PageProps {
  searchParams: { saved?: string };
}

export default async function NotificationsPage({ searchParams }: PageProps) {
  const config = await getConfig();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Notification Settings</h1>
        <p className="text-sm text-stone-500 mt-1">
          Configure email and SMS delivery settings for customer notifications.
        </p>
      </div>

      {searchParams.saved === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-green-800 text-sm font-medium">
          Notification settings saved successfully.
        </div>
      )}

      <form action={saveNotifications}>
        {/* Email Settings */}
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-stone-800">Email Notifications</h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Configure the sender identity used for all outgoing emails.
              </p>
            </div>
            {/* Enable email toggle */}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="featureEmailNotify"
                defaultChecked={config?.featureEmailNotify ?? false}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700" />
              <span className="ml-2 text-sm font-medium text-stone-600">Enabled</span>
            </label>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              From Name
            </label>
            <div className="col-span-2">
              <input
                type="text"
                name="emailFromName"
                defaultValue={config?.emailFromName ?? ""}
                placeholder="Gentle Groomer"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-xs text-stone-400 mt-1">
                The display name shown in the customer&apos;s inbox.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              From Address
            </label>
            <div className="col-span-2">
              <input
                type="email"
                name="emailFromAddress"
                defaultValue={config?.emailFromAddress ?? ""}
                placeholder="no-reply@gentlegroomer.com"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-xs text-stone-400 mt-1">
                The email address replies will be sent to. Must be verified with your email provider.
              </p>
            </div>
          </div>
        </div>

        {/* SMS Settings */}
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5 mt-6">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-stone-800">SMS Notifications</h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Powered by Twilio. Enter your credentials below to enable SMS delivery.
              </p>
            </div>
            {/* Enable SMS toggle */}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                name="featureSmsNotify"
                defaultChecked={config?.featureSmsNotify ?? false}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700" />
              <span className="ml-2 text-sm font-medium text-stone-600">Enabled</span>
            </label>
          </div>

          {/* Info banner */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 flex gap-3">
            <svg
              className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            <p className="text-xs text-stone-500">
              SMS requires the <strong>SMS Notifications</strong> toggle to be enabled above and valid
              Twilio credentials. The auth token is write-only — leave the field blank to keep the
              existing stored value.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Twilio Account SID
            </label>
            <div className="col-span-2">
              <input
                type="text"
                name="twilioAccountSid"
                defaultValue={config?.twilioAccountSid ?? ""}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Twilio Auth Token
            </label>
            <div className="col-span-2">
              <input
                type="password"
                name="twilioAuthToken"
                defaultValue=""
                placeholder={
                  config?.twilioAuthToken ? "••••••••••••••••••••••••••••••••" : "Paste auth token"
                }
                autoComplete="new-password"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
              />
              <p className="text-xs text-stone-400 mt-1">
                {config?.twilioAuthToken
                  ? "A token is already stored. Leave blank to keep the existing value."
                  : "Paste your Twilio auth token. It will be stored securely."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Twilio From Number
            </label>
            <div className="col-span-2">
              <input
                type="tel"
                name="twilioFromNumber"
                defaultValue={config?.twilioFromNumber ?? ""}
                placeholder="+15551234567"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-xs text-stone-400 mt-1">
                Your Twilio phone number in E.164 format (e.g. +15551234567).
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Save Notification Settings
          </button>
        </div>
      </form>
    </div>
  );
}
