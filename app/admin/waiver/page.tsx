import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Everything about the liability waiver lives here: the on/off flag, the
 * version, the document text, and the acceptance record. The flag is
 * deliberately NOT on the Features page — enabling it without waiver text is
 * a no-op (SystemConfig.waiverText null = feature off), so the switch and the
 * document have to be edited together.
 */

async function saveWaiver(formData: FormData) {
  "use server";

  const featureWaiverRequired = formData.get("featureWaiverRequired") === "on";
  const waiverText = ((formData.get("waiverText") as string | null) ?? "").trim();
  const waiverVersion = ((formData.get("waiverVersion") as string | null) ?? "").trim();

  if (!waiverVersion) {
    redirect("/admin/waiver?error=version_required");
  }
  if (featureWaiverRequired && !waiverText) {
    redirect("/admin/waiver?error=text_required");
  }

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: {
      featureWaiverRequired,
      waiverText: waiverText || null,
      waiverVersion,
    },
  });

  revalidatePath("/admin/waiver");
  revalidatePath("/admin");
  redirect("/admin/waiver?saved=1");
}

const ERRORS: Record<string, string> = {
  version_required: "Waiver version cannot be empty — customers are tracked against it.",
  text_required: "Add the waiver text before requiring customers to accept it.",
};

interface PageProps {
  searchParams: { saved?: string; error?: string };
}

export default async function WaiverPage({ searchParams }: PageProps) {
  const config = await getConfig();
  const currentVersion = config.waiverVersion;

  const [activeCustomers, acceptedCurrent, versionGroups] = await Promise.all([
    prisma.customer.count({ where: { isActive: true } }),
    currentVersion
      ? prisma.customer.count({
          where: {
            isActive: true,
            waiverAcceptances: { some: { waiverVersion: currentVersion } },
          },
        })
      : Promise.resolve(0),
    prisma.waiverAcceptance.groupBy({
      by: ["waiverVersion"],
      _count: { _all: true },
      orderBy: { waiverVersion: "desc" },
    }),
  ]);

  const outstanding = Math.max(activeCustomers - acceptedCurrent, 0);
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Liability Waiver</h1>
        <p className="text-sm text-stone-500 mt-1">
          The single place to turn the waiver on or off, edit its text, set its version, and see
          who has accepted it.
        </p>
      </div>

      {searchParams.saved === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-green-800 text-sm font-medium">
          Waiver saved successfully.
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-800 text-sm font-medium">
          {errorMessage} Nothing was saved.
        </div>
      )}

      {/* Acceptance status — live figures, not a projection */}
      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3 mb-4">
          Acceptance Status
        </h2>
        {config.featureWaiverRequired ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-3xl font-black text-stone-900">{activeCustomers}</p>
              <p className="text-xs text-stone-500 mt-1">Active customers</p>
            </div>
            <div>
              <p className="text-3xl font-black text-green-700">{acceptedCurrent}</p>
              <p className="text-xs text-stone-500 mt-1">
                Accepted version {currentVersion ?? "—"}
              </p>
            </div>
            <div>
              <p
                className={`text-3xl font-black ${
                  outstanding > 0 ? "text-amber-700" : "text-stone-300"
                }`}
              >
                {outstanding}
              </p>
              <p className="text-xs text-stone-500 mt-1">Awaiting acceptance</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            The waiver is currently switched off — customers are not asked to accept anything.
          </p>
        )}

        {versionGroups.length > 0 && (
          <div className="mt-5 border-t border-stone-100 pt-4">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
              Acceptances on record
            </p>
            <ul className="text-sm text-stone-600 space-y-1">
              {versionGroups.map((group) => (
                <li key={group.waiverVersion} className="flex items-center gap-2">
                  <span className="font-medium text-stone-800">
                    Version {group.waiverVersion}
                  </span>
                  {group.waiverVersion === currentVersion && (
                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      CURRENT
                    </span>
                  )}
                  <span className="text-stone-400">
                    · {group._count._all} acceptance{group._count._all !== 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <form action={saveWaiver}>
        {/* Requirement switch */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3 mb-2">
            Requirement
          </h2>
          <div className="flex items-start gap-4 py-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-800">Waiver Required</p>
              <p className="text-sm text-stone-500 mt-0.5">
                Require customers to read and accept the waiver below when they register, and
                again whenever the version changes.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer mt-0.5">
              <input
                type="checkbox"
                name="featureWaiverRequired"
                defaultChecked={config.featureWaiverRequired}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700" />
            </label>
          </div>
        </div>

        {/* Version change warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex gap-3 mt-6">
          <svg
            className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">Version Change Warning</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Updating the waiver version number will require <strong>all existing customers</strong> to
              re-accept the waiver before their next appointment. Only increment the version when the
              waiver content has materially changed.
            </p>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5 mt-6">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3">
            Waiver Document
          </h2>

          {/* Version */}
          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Waiver Version
            </label>
            <div className="col-span-2">
              <input
                type="text"
                name="waiverVersion"
                defaultValue={currentVersion ?? "1.0"}
                placeholder="1.0"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-xs text-stone-400 mt-1">
                Current version: <span className="font-medium text-stone-600">{currentVersion ?? "1.0"}</span>.
                Change this value to require all customers to re-sign.
              </p>
            </div>
          </div>

          {/* Waiver text */}
          <div className="grid grid-cols-3 gap-4 items-start">
            <label className="text-sm font-medium text-stone-700 pt-2">
              Waiver Text
            </label>
            <div className="col-span-2">
              <textarea
                name="waiverText"
                defaultValue={config.waiverText ?? ""}
                rows={20}
                placeholder="Enter the full waiver text here. Customers will be required to read and accept this before their first appointment…"
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y font-mono leading-relaxed"
              />
              <p className="text-xs text-stone-400 mt-1">
                Plain text. Line breaks are preserved when displayed to customers.
              </p>
            </div>
          </div>
        </div>

        {/* How acceptance works */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 mt-6">
          <h3 className="text-sm font-semibold text-stone-700 mb-1">About waiver acceptance</h3>
          <ul className="text-sm text-stone-500 space-y-1 list-disc list-inside">
            <li>Customers accept the waiver once per version, at registration or after a version change.</li>
            <li>Each acceptance is stored with a timestamp, the accepted version, and the signing IP.</li>
            <li>Turning the requirement off leaves existing acceptance records untouched.</li>
            <li>Requiring the waiver with empty text is rejected — customers would have nothing to sign.</li>
          </ul>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Save Waiver
          </button>
        </div>
      </form>
    </div>
  );
}
