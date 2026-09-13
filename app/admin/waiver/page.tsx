import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import { nextAvailableVersion, recordRevision } from "@/lib/waiver";
import { formatShopDate } from "@/lib/utils";
import VersionField from "./VersionField";
import SaveToast from "@/components/SaveToast";
import { PageShell, PageSection, StatStrip } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Liability Waiver" };

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
  searchParams: Promise<{
    saved?: string;
    error?: string;
    version?: string;
    bumped?: string;
    restored?: string;
  }>;
}

export default async function WaiverPage(props: PageProps) {
  const searchParams = await props.searchParams;
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
      subtitle="The document, who has signed it, and every version you have published"
    >
      {/* Confirmation lands in the middle of the viewport: the save button on
          this page is below a twenty-row textarea, so a banner at the top was
          off-screen at the moment it mattered. */}
      {searchParams.saved === "1" && (
        <SaveToast
          message={`Saved as version ${searchParams.version}`}
          detail={
            searchParams.bumped === "1"
              ? "The text changed, so the version moved up. Every customer will be asked to accept it again."
              : undefined
          }
        />
      )}
      {searchParams.restored && (
        <SaveToast
          message={`Restored version ${searchParams.restored}`}
          detail="Customers who already accepted that exact version stay accepted."
        />
      )}
      {errorMessage && <SaveToast tone="error" message="Nothing was saved" detail={errorMessage} />}

      {/* Where the waiver stands right now, in one line rather than a block of
          three big numbers competing with the document below. */}
      {config.featureWaiverRequired ? (
        <StatStrip
          stats={[
            { label: "Active customers", value: activeCustomers },
            {
              label: `Accepted ${currentVersion ?? "—"}`,
              value: <span className="text-green-700">{acceptedCurrent}</span>,
            },
            {
              label: "Awaiting acceptance",
              value: (
                <span className={outstanding > 0 ? "text-amber-700" : "text-stone-400"}>
                  {outstanding}
                </span>
              ),
            },
          ]}
        />
      ) : (
        <PageSection tone="muted">
          <p className="text-sm text-stone-500">
            The waiver is switched off — customers are not asked to accept anything.
          </p>
        </PageSection>
      )}

      <form action={saveWaiver}>
        {/* The switch and the version sit on one strip: they are the two
            decisions about the document, and neither is worth its own band. */}
        <PageSection tone="muted" bodyClassName="space-y-3">
          {/* The switch's name is inside its label; the paragraph under it is
              read after the name rather than as part of it. */}
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <span className="relative inline-flex items-center mt-0.5 flex-none">
                <input
                  type="checkbox"
                  name="featureWaiverRequired"
                  defaultChecked={config.featureWaiverRequired}
                  aria-describedby="waiver-required-description"
                  className="sr-only peer"
                />
                <span className="block w-11 h-6 bg-stone-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-stone-900 dark:peer-focus-visible:outline-stone-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600" />
              </span>
              <span className="flex-1 min-w-0 text-sm font-bold text-stone-800">
                Require the waiver
              </span>
            </label>
            <p id="waiver-required-description" className="pl-14 text-sm text-stone-500">
              Customers accept it when they register, and again whenever the version changes.
              Publishing a new version asks everyone again — so change the text only when it
              materially changes.
            </p>
          </div>

          <div className="border-t border-stone-200 pt-3">
            <VersionField currentVersion={currentVersion ?? "1.0"} nextVersion={nextVersion} />
          </div>
        </PageSection>

        {/* The document itself takes the leftover height: it is what the page
            is for, and a twenty-row box that scrolls the page is worse than one
            that scrolls itself. */}
        <PageSection grow padded={false} bodyClassName="flex flex-col">
          <label
            htmlFor="waiverText"
            className="px-3 pt-3 pb-1 font-bold text-stone-700 text-xs tracking-tight"
          >
            Waiver text
          </label>
          <textarea
            id="waiverText"
            name="waiverText"
            defaultValue={config.waiverText ?? ""}
            placeholder="The full waiver text. Customers read and accept this before their first appointment…"
            className="flex-1 min-h-[16rem] w-full border-0 px-3 py-2 text-sm focus:outline-none focus:ring-0 resize-none font-mono leading-relaxed bg-transparent"
          />
          <p className="px-3 pb-2 text-xs text-stone-400">
            Plain text. Line breaks are kept when it is shown to customers.
          </p>
        </PageSection>

        <PageSection tone="muted" bodyClassName="flex justify-end">
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-bold transition-colors"
          >
            Save waiver
          </button>
        </PageSection>
      </form>

      {/* History is a record, not a control, so it sits after the thing it is
          a record of. */}
      {(revisions.length > 0 || versionGroups.length > 0) && (
        <PageSection title="Version history" padded={false}>
          <ul className="divide-y divide-stone-100">
            {revisions.map((revision) => {
              const accepted = acceptancesByVersion.get(revision.version) ?? 0;
              const isCurrent = revision.version === currentVersion;
              return (
                <li key={revision.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-stone-800 tabular-nums">
                      Version {revision.version}
                    </span>
                    {isCurrent && (
                      <span className="ml-2 bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                        IN USE
                      </span>
                    )}
                    <span className="block text-xs text-stone-500">
                      Published {formatShopDate(revision.createdAt)}
                      {revision.createdBy && ` by ${revision.createdBy.name}`} · {accepted}{" "}
                      acceptance{accepted !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {!isCurrent && (
                    <form action={restoreRevision}>
                      <input type="hidden" name="version" value={revision.version} />
                      <button
                        type="submit"
                        className="text-xs font-bold text-brand-text hover:underline whitespace-nowrap"
                      >
                        Restore
                      </button>
                    </form>
                  )}
                </li>
              );
            })}

            {/* Versions signed before revision text was kept. */}
            {versionGroups
              .filter((group) => !revisions.some((r) => r.version === group.waiverVersion))
              .map((group) => (
                <li key={group.waiverVersion} className="px-3 py-2">
                  <span className="text-sm font-bold text-stone-800 tabular-nums">
                    Version {group.waiverVersion}
                  </span>
                  <span className="block text-xs text-stone-500">
                    {group._count._all} acceptance{group._count._all !== 1 ? "s" : ""} · text not
                    stored, cannot be restored
                  </span>
                </li>
              ))}
          </ul>
        </PageSection>
      )}

      <PageSection tone="muted">
        <ul className="text-sm text-stone-500 space-y-1 list-disc list-inside">
          <li>Each acceptance is stored with its timestamp, the version accepted, and the signing IP.</li>
          <li>Turning the requirement off leaves existing acceptances untouched.</li>
          <li>Requiring the waiver with no text is rejected — there would be nothing to sign.</li>
          <li>Every published version is kept, so an earlier document can be restored under its original number.</li>
        </ul>
      </PageSection>
    </PageShell>
  );
}
