import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function saveSettings(formData: FormData) {
  "use server";

  const shopName = formData.get("shopName") as string;
  const shopPhone = formData.get("shopPhone") as string;
  const shopEmail = formData.get("shopEmail") as string;
  const shopAddress = formData.get("shopAddress") as string;
  const shopWebsite = formData.get("shopWebsite") as string;
  const emailFromName = formData.get("emailFromName") as string;
  const emailFromAddress = formData.get("emailFromAddress") as string;

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: {
      shopName,
      shopPhone,
      shopEmail,
      shopAddress,
      shopWebsite,
      emailFromName,
      emailFromAddress,
    },
  });

  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

interface PageProps {
  searchParams: { saved?: string };
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const config = await getConfig();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Shop Settings</h1>
          <p className="text-sm text-stone-500 mt-1">
            Manage your shop&apos;s general information and contact details.
          </p>
        </div>
      </div>

      {searchParams.saved === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-green-800 text-sm font-medium">
          Settings saved successfully.
        </div>
      )}

      <form action={saveSettings}>
        {/* Shop Information */}
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3">
            Shop Information
          </h2>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Shop Name
            </label>
            <div className="col-span-2">
              <input
                type="text"
                name="shopName"
                defaultValue={config?.shopName ?? ""}
                placeholder="Gentle Groomer"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Phone Number
            </label>
            <div className="col-span-2">
              <input
                type="tel"
                name="shopPhone"
                defaultValue={config?.shopPhone ?? ""}
                placeholder="(555) 123-4567"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Email Address
            </label>
            <div className="col-span-2">
              <input
                type="email"
                name="shopEmail"
                defaultValue={config?.shopEmail ?? ""}
                placeholder="hello@gentlegroomer.com"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Address
            </label>
            <div className="col-span-2">
              <textarea
                name="shopAddress"
                defaultValue={config?.shopAddress ?? ""}
                placeholder="123 Main St, Springfield, IL 62701"
                rows={3}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Website
            </label>
            <div className="col-span-2">
              <input
                type="url"
                name="shopWebsite"
                defaultValue={config?.shopWebsite ?? ""}
                placeholder="https://www.gentlegroomer.com"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Email Sender Settings */}
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5 mt-6">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3">
            Email Sender Settings
          </h2>
          <p className="text-sm text-stone-500 -mt-2">
            These values appear in the &ldquo;From&rdquo; field of emails sent to customers.
          </p>

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
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
}
