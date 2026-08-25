import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import { nextAvailableVersion, recordRevision } from "@/lib/waiver";
import { formatShopDate } from "@/lib/utils";
import VersionField from "./VersionField";
import { PageShell, PageSection } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Waiver" };

/**
 * Everything about the liability waiver lives here: the on/off flag, the
 * version, the document text, and the acceptance record. The flag is
 * deliberately NOT on the Features page — enabling it without waiver text is
 * a no-op (SystemConfig.waiverText null = feature off), so the switch and the
 * document have to be edited together.
 */

async function saveWaiver(formData: FormData) {
  "use server";

  const staffId = await requireManager();

  const featureWaiverRequired = formData.get("featureWaiverRequired") === "on";
  const waiverText = ((formData.get("waiverText") as string | null) ?? "").trim();
  const manualVersion = formData.get("versionMode") === "manual";
  const typedVersion = ((formData.get("waiverVersion") as string | null) ?? "").trim();

  if (featureWaiverRequired && !waiverText) {
    redirect("/admin/waiver?error=text_required");
  }
  if (manualVersion && !typedVersion) {
    redirect("/admin/waiver?error=version_required");
  }

  const config = await getConfig();
  const textChanged = (config.waiverText ?? "").trim() !== waiverText;

  // Keep the outgoing text recoverable before it is replaced.
  if (config.waiverVersion && config.waiverText) {
    await recordRevision(config.waiverVersion, config.waiverText);
  }

  let version: string;
  if (manualVersion) {
    version = typedVersion;
  } else if (textChanged) {
    version = await nextAvailableVersion(config.waiverVersion);
  } else {
    version = config.waiverVersion ?? "1.0";
  }

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: {
      featureWaiverRequired,
      waiverText: waiverText || null,
      waiverVersion: version,
    },
  });

  if (waiverText) {
    await recordRevision(version, waiverText, staffId);
  }

  revalidatePath("/admin/waiver");
  revalidatePath("/admin");
  redirect(
    `/admin/waiver?saved=1&version=${encodeURIComponent(version)}${textChanged && !manualVersion ? "&bumped=1" : ""}`
  );
}

async function restoreRevision(formData: FormData) {
  "use server";

  await requireManager();

  const version = ((formData.get("version") as string | null) ?? "").trim();
  const revision = await prisma.waiverRevision.findUnique({ where: { version } });
  if (!revision) {
    redirect("/admin/waiver?error=revision_missing");
  }

  const config = await getConfig();
  if (config.waiverVersion && config.waiverText) {
    await recordRevision(config.waiverVersion, config.waiverText);
  }

  // Restoring puts the original number back: customers who already accepted
  // this exact text stay accepted.
  await prisma.systemConfig.update({
    where: { id: "global" },
    data: { waiverText: revision.text, waiverVersion: revision.version },
  });

  revalidatePath("/admin/waiver");
  revalidatePath("/admin");
  redirect(`/admin/waiver?restored=${encodeURIComponent(revision.version)}`);
}

const ERRORS: Record<string, string> = {
  version_required: "Enter a version number, or switch back to automatic versioning.",
  text_required: "Add the waiver text before requiring customers to accept it.",
  revision_missing: "That revision is no longer stored.",
};

interface PageProps {
  searchParams: {
    saved?: string;
    error?: string;
    version?: string;
    bumped?: string;
    restored?: string;
  };
}

export default async function WaiverPage({ searchParams }: PageProps) {
  const config = await getConfig();
  const currentVersion = config.waiverVersion;

  const [activeCustomers, acceptedCurrent, versionGroups, revisions, nextVersion] = await Promise.all([
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
    prisma.waiverRevision.findMany({
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    nextAvailableVersion(currentVersion),
  ]);

  const acceptancesByVersion = new Map(
    versionGroups.map((group) => [group.waiverVersion, group._count._all])
  );

  const outstanding = Math.max(activeCustomers - acceptedCurrent, 0);
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <PageShell
      title="Liability Waiver"
      subtitle="The single place to turn the waiver on or off, edit its text, set its version, and see who has accepted it."
    >

      {searchParams.saved === "1" && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Waiver saved as version {searchParams.version}.
          {searchParams.bumped === "1" && (
            <span className="font-normal">
              {" "}
              The text changed, so the version was bumped and every customer will be asked to accept
              it again.
            </span>
          )}
        </p>
      )}

      {searchParams.restored && (
        <p className="border-t border-stone-100 bg-green-50 px-3 py-2 text-green-800 text-sm font-medium">
          Restored version {searchParams.restored}. Customers who already accepted that exact
          version stay accepted.
        </p>
      )}

      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {errorMessage} Nothing was saved.
        </p>
      )}

      {/* Acceptance status — live figures, not a projection */}
      <PageSection title="Acceptance Status">
        {config.featureWaiverRequired ? (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-2xl font-black text-stone-900">{activeCustomers}</p>
              <p className="text-xs text-stone-500 mt-1">Active customers</p>
            </div>
            <div>
              <p className="text-2xl font-black text-green-700">{acceptedCurrent}</p>
              <p className="text-xs text-stone-500 mt-1">
                Accepted version {currentVersion ?? "—"}
              </p>
            </div>
            <div>
              <p
                className={`text-2xl font-black ${
                  outstanding > 0 ? "text-amber-700" : "text-stone-400"
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

        {(revisions.length > 0 || versionGroups.length > 0) && (
          <div className="mt-3 border-t border-stone-100 pt-4">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
              Version history
            </p>
            <ul className="divide-y divide-stone-100">
              {revisions.map((revision) => {
                const accepted = acceptancesByVersion.get(revision.version) ?? 0;
                const isCurrent = revision.version === currentVersion;
                return (
                  <li key={revision.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-stone-800">
                        Version {revision.version}
                      </span>
                      {isCurrent && (
                        <span className="ml-2 bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                          CURRENT
                        </span>
                      )}
                      <span className="block text-xs text-stone-400">
                        Published {formatShopDate(revision.createdAt)}
                        {revision.createdBy && ` by ${revision.createdBy.name}`} · {accepted}{" "}
                        acceptance{accepted !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {isCurrent ? (
                      <span className="text-xs text-stone-400 whitespace-nowrap">In use</span>
                    ) : (
                      <form action={restoreRevision}>
                        <input type="hidden" name="version" value={revision.version} />
                        <button
                          type="submit"
                          className="text-xs font-semibold text-amber-700 hover:text-amber-900 underline whitespace-nowrap"
                        >
                          Restore
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}

              {/* Versions customers signed before revision text was kept */}
              {versionGroups
                .filter((group) => !revisions.some((r) => r.version === group.waiverVersion))
                .map((group) => (
                  <li
                    key={group.waiverVersion}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div>
                      <span className="text-sm font-medium text-stone-800">
                        Version {group.waiverVersion}
                      </span>
                      <span className="block text-xs text-stone-400">
                        {group._count._all} acceptance{group._count._all !== 1 ? "s" : ""} · text not
                        stored, cannot be restored
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </PageSection>

      <form action={saveWaiver}>
        {/* Requirement switch */}
        <PageSection title="Requirement">
          <div className="flex items-start gap-3 py-4">
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
        </PageSection>

        {/* Version change warning */}
        <div className="border-t border-stone-100 bg-amber-50 px-3 py-2 flex gap-3">
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

        <PageSection title="Waiver Document" bodyClassName="space-y-5">

          <VersionField
            currentVersion={currentVersion ?? "1.0"}
            nextVersion={nextVersion}
          />

          {/* Waiver text */}
          <div className="grid grid-cols-3 gap-3 items-start">
            <label htmlFor="waiverText" className="text-sm font-medium text-stone-700 pt-2">
              Waiver Text
            </label>
            <div className="col-span-2">
              <textarea
                id="waiverText" name="waiverText"
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
        </PageSection>

        {/* How acceptance works */}
        <PageSection tone="muted" title="About waiver acceptance">
          <ul className="text-sm text-stone-500 space-y-1 list-disc list-inside">
            <li>Customers accept the waiver once per version, at registration or after a version change.</li>
            <li>Each acceptance is stored with a timestamp, the accepted version, and the signing IP.</li>
            <li>Turning the requirement off leaves existing acceptance records untouched.</li>
            <li>Requiring the waiver with empty text is rejected — customers would have nothing to sign.</li>
            <li>Every published version is kept, so an earlier document can be restored under its original number.</li>
          </ul>
        </PageSection>

        <PageSection tone="muted" bodyClassName="flex justify-end">
          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Save Waiver
          </button>
        </PageSection>
      </form>
    </PageShell>
  );
}
