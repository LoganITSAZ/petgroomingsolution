import { getConfig } from "@/lib/config";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guards";
import { currentStaffIsAdmin } from "@/lib/staff-roles";
import { PageShell, PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Notifications" };

async function saveNotifications(formData: FormData) {
  "use server";

  await requireAdmin();

  const emailFromAddress = formData.get("emailFromAddress") as string;
  const twilioAccountSid = formData.get("twilioAccountSid") as string;
  const twilioAuthToken = formData.get("twilioAuthToken") as string;
  const twilioFromNumber = formData.get("twilioFromNumber") as string;

  const data: Record<string, unknown> = {
    emailFromAddress,
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

/**
 * Whether email or SMS goes out at all is a shop setting, set with the other
 * features on /admin/settings. This page holds what makes them work — the
 * sender address and the Twilio credentials — and only reports the flag.
 */
function StatusPill({ on }: { on: boolean }) {
  return (
    <Link
      href="/admin/settings"
      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
        on
          ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
          : "bg-stone-50 border-stone-200 text-stone-500 hover:bg-stone-100"
      }`}
    >
      {on ? "Enabled" : "Disabled"} · change in Shop Settings
    </Link>
  );
}

interface PageProps {
  searchParams: Promise<{ saved?: string }>;
}

export default async function NotificationsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  // Delivery credentials are a technical screen — admin only, not the manager.
  if (!(await currentStaffIsAdmin())) redirect("/staff");

  const config = await getConfig();

  return (
    <PageShell
      title="Notifications"
      subtitle="Configure email and SMS delivery settings for customer notifications."
    >

      {searchParams.saved === "1" && (
        <SaveToast>
          Notification settings saved successfully.
        </SaveToast>
      )}

      <form action={saveNotifications}>
        {/* Email Settings */}
        <PageSection bodyClassName="space-y-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-stone-800">Email Notifications</h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Emails go out as{" "}
                <span className="font-medium text-stone-600">{config?.shopName ?? "your shop name"}</span>
                , the Shop Name set in{" "}
                <Link href="/admin/settings" className="underline hover:text-stone-700">
                  Shop Settings
                </Link>
                .
              </p>
            </div>
            <StatusPill on={config?.featureEmailNotify ?? false} />
          </div>

          <div className="grid grid-cols-3 gap-3 items-start">
            <label htmlFor="emailFromAddress" className="text-sm font-medium text-stone-700 pt-2">
              From Address
            </label>
            <div className="col-span-2">
              <input
                type="email"
                id="emailFromAddress" name="emailFromAddress"
                defaultValue={config?.emailFromAddress ?? ""}
                placeholder="no-reply@example.com"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-stone-400 mt-1">
                The email address replies will be sent to. Must be verified with your email provider.
              </p>
            </div>
          </div>
        </PageSection>

        {/* SMS Settings */}
        <PageSection bodyClassName="space-y-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-stone-800">SMS Notifications</h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Powered by Twilio. Enter your credentials below to enable SMS delivery.
              </p>
            </div>
            <StatusPill on={config?.featureSmsNotify ?? false} />
          </div>

          {/* Info banner */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 flex gap-3">
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

          <div className="grid grid-cols-3 gap-3 items-start">
            <label htmlFor="twilioAccountSid" className="text-sm font-medium text-stone-700 pt-2">
              Twilio Account SID
            </label>
            <div className="col-span-2">
              <input
                type="text"
                id="twilioAccountSid" name="twilioAccountSid"
                defaultValue={config?.twilioAccountSid ?? ""}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-start">
            <label htmlFor="twilioAuthToken" className="text-sm font-medium text-stone-700 pt-2">
              Twilio Auth Token
            </label>
            <div className="col-span-2">
              <input
                type="password"
                id="twilioAuthToken" name="twilioAuthToken"
                defaultValue=""
                placeholder={
                  config?.twilioAuthToken ? "••••••••••••••••••••••••••••••••" : "Paste auth token"
                }
                autoComplete="new-password"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm font-mono"
              />
              <p className="text-xs text-stone-400 mt-1">
                {config?.twilioAuthToken
                  ? "A token is already stored. Leave blank to keep the existing value."
                  : "Paste your Twilio auth token. It will be stored securely."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-start">
            <label htmlFor="twilioFromNumber" className="text-sm font-medium text-stone-700 pt-2">
              Twilio From Number
            </label>
            <div className="col-span-2">
              <input
                type="tel"
                id="twilioFromNumber" name="twilioFromNumber"
                defaultValue={config?.twilioFromNumber ?? ""}
                placeholder="+15551234567"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-stone-400 mt-1">
                Your Twilio phone number in E.164 format (e.g. +15551234567).
              </p>
            </div>
          </div>
        </PageSection>

        <PageSection tone="muted" bodyClassName="flex justify-end">
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Save Notification Settings
          </button>
        </PageSection>
      </form>
    </PageShell>
  );
}
