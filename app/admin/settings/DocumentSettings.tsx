import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth-guards";
import { activeDocuments, nextAvailableVersion, recordRevision } from "@/lib/documents";
import { formatShopDate } from "@/lib/utils";
import { ShopDocumentKind } from "@prisma/client";
import VersionField from "./VersionField";
import SaveToast from "@/components/SaveToast";
import { PageSection, StatStrip } from "@/components/ui";

/**
 * The documents a customer signs, one disclosure each.
 *
 * It was one waiver on two `SystemConfig` columns. A shop that also has a
 * matting release and a medical consent would have needed six, so the documents
 * are rows and this screen is the same controls repeated over them — text, its
 * version, who has signed it, and every version published.
 */

const KIND_LABELS: Record<ShopDocumentKind, string> = {
  WAIVER: "Liability waiver",
  MATTING_RELEASE: "Matting release",
  MEDICAL_CONSENT: "Emergency medical consent",
  OTHER: "Other",
};

function anchor(query: string) {
  return `/admin/settings${query}#shop-documents`;
}

async function savePolicy(formData: FormData) {
  "use server";

  await requireManager();
  await prisma.systemConfig.update({
    where: { id: "global" },
    data: { featureWaiverRequired: formData.get("featureWaiverRequired") === "on" },
  });

  revalidatePath("/admin/settings");
  redirect(anchor("?waiverSaved=policy"));
}

async function saveDocument(formData: FormData) {
  "use server";

  const staffId = await requireManager();

  const documentId = ((formData.get("documentId") as string | null) ?? "").trim();
  const title = ((formData.get("title") as string | null) ?? "").trim();
  const body = ((formData.get("body") as string | null) ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  const manualVersion = formData.get("versionMode") === "manual";
  const typedVersion = ((formData.get("version") as string | null) ?? "").trim();

  const document = await prisma.shopDocument.findUnique({ where: { id: documentId } });
  if (!document) redirect(anchor("?waiverError=document_missing"));
  if (!title) redirect(anchor("?waiverError=title_required"));
  if (isActive && !body) redirect(anchor("?waiverError=text_required"));
  if (manualVersion && !typedVersion) redirect(anchor("?waiverError=version_required"));

  // Keep the outgoing text recoverable before it is replaced.
  if (document.body) await recordRevision(document.id, document.version, document.body);

  const textChanged = document.body.trim() !== body;
  const version = manualVersion
    ? typedVersion
    : textChanged
      ? await nextAvailableVersion(document.id, document.version)
      : document.version;

  await prisma.shopDocument.update({
    where: { id: document.id },
    data: { title, body, isActive, version },
  });
  if (body) await recordRevision(document.id, version, body, staffId);

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  redirect(
    anchor(
      `?waiverSaved=1&version=${encodeURIComponent(version)}${textChanged && !manualVersion ? "&bumped=1" : ""}`
    )
  );
}

async function addDocument(formData: FormData) {
  "use server";

  await requireManager();

  const title = ((formData.get("title") as string | null) ?? "").trim();
  const kindValue = (formData.get("kind") as string | null) ?? "";
  const kind = Object.hasOwn(ShopDocumentKind, kindValue)
    ? (kindValue as ShopDocumentKind)
    : ShopDocumentKind.OTHER;
  if (!title) redirect(anchor("?waiverError=title_required"));

  const count = await prisma.shopDocument.count();
  // Inactive with no text: a document nobody has written is not something to
  // put in front of a customer, and the disclosure opens on it to be filled in.
  await prisma.shopDocument.create({
    data: { title, kind, body: "", version: "1.0", isActive: false, sortOrder: count },
  });

  revalidatePath("/admin/settings");
  redirect(anchor("?waiverSaved=added"));
}

async function restoreRevision(formData: FormData) {
  "use server";

  await requireManager();

  const documentId = ((formData.get("documentId") as string | null) ?? "").trim();
  const version = ((formData.get("version") as string | null) ?? "").trim();
  const revision = await prisma.documentRevision.findUnique({
    where: { documentId_version: { documentId, version } },
  });
  if (!revision) redirect(anchor("?waiverError=revision_missing"));

  const document = await prisma.shopDocument.findUnique({ where: { id: documentId } });
  if (!document) redirect(anchor("?waiverError=document_missing"));
  if (document.body) await recordRevision(document.id, document.version, document.body);

  // Restoring puts the original number back: customers who already accepted
  // this exact text stay accepted.
  await prisma.shopDocument.update({
    where: { id: document.id },
    data: { body: revision.text, version: revision.version },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  redirect(anchor(`?restored=${encodeURIComponent(revision.version)}`));
}

const ERRORS: Record<string, string> = {
  version_required: "Enter a version number, or switch back to automatic versioning.",
  text_required: "Add the text before asking customers to sign it.",
  title_required: "Give the document a name.",
  revision_missing: "That revision is no longer stored.",
  document_missing: "That document no longer exists.",
};

const SAVED: Record<string, { message: string; detail?: string }> = {
  policy: { message: "Saved" },
  added: { message: "Document added", detail: "Write its text, then switch it on." },
};

interface PageProps {
  searchParams: Promise<{
    waiverSaved?: string;
    waiverError?: string;
    version?: string;
    bumped?: string;
    restored?: string;
  }>;
}

export default async function DocumentSettings(props: PageProps) {
  const searchParams = await props.searchParams;
  const config = await getConfig();

  const [documents, live, activeCustomers, acceptanceGroups, revisions] = await Promise.all([
    prisma.shopDocument.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    activeDocuments(),
    prisma.customer.count({ where: { isActive: true } }),
    prisma.documentAcceptance.groupBy({
      by: ["documentId", "version"],
      _count: { _all: true },
    }),
    prisma.documentRevision.findMany({
      include: { createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Resolved here rather than in the render: the next free number is a query,
  // and a `.map()` callback cannot await.
  const nextVersions = new Map(
    await Promise.all(
      documents.map(
        async (document) =>
          [document.id, await nextAvailableVersion(document.id, document.version)] as const
      )
    )
  );

  const accepted = new Map(
    acceptanceGroups.map((group) => [`${group.documentId}@${group.version}`, group._count._all])
  );
  // The whole set, because a customer who has signed two of three documents is
  // still somebody the booking screen will stop.
  const signedCurrent = live.reduce(
    (lowest, document) =>
      Math.min(lowest, accepted.get(`${document.id}@${document.version}`) ?? 0),
    live.length > 0 ? Number.MAX_SAFE_INTEGER : 0
  );
  const outstanding = Math.max(activeCustomers - signedCurrent, 0);
  const errorMessage = searchParams.waiverError ? ERRORS[searchParams.waiverError] : undefined;
  const savedNote = searchParams.waiverSaved ? SAVED[searchParams.waiverSaved] : undefined;

  return (
    <section id="shop-documents" aria-label="Documents" className="scroll-mt-4">
      <PageSection title="Documents" tone="muted">
        <p className="text-sm text-stone-500">
          What a customer signs before their first visit — the waiver, and anything else the shop
          asks for. Each one carries its own text, its own version and its own signatures.
        </p>
      </PageSection>

      {searchParams.waiverSaved === "1" && (
        <SaveToast
          message={`Saved as version ${searchParams.version}`}
          detail={
            searchParams.bumped === "1"
              ? "The text changed, so the version moved up. Every customer will be asked to sign it again."
              : undefined
          }
        />
      )}
      {savedNote && <SaveToast message={savedNote.message} detail={savedNote.detail} />}
      {searchParams.restored && (
        <SaveToast
          message={`Restored version ${searchParams.restored}`}
          detail="Customers who already signed that exact version stay signed."
        />
      )}
      {errorMessage && <SaveToast tone="error" message="Nothing was saved" detail={errorMessage} />}

      <PageSection tone="muted" bodyClassName="space-y-3">
        <form action={savePolicy}>
          <label className="flex items-start gap-3 cursor-pointer">
            <span className="relative inline-flex items-center mt-0.5 flex-none">
              <input
                type="checkbox"
                name="featureWaiverRequired"
                defaultChecked={config.featureWaiverRequired}
                aria-describedby="documents-required-description"
                className="sr-only peer"
              />
              <span className="block w-11 h-6 bg-stone-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-stone-900 dark:peer-focus-visible:outline-stone-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600" />
            </span>
            <span className="flex-1 min-w-0 text-sm font-bold text-stone-800">
              Require these documents
            </span>
            <button
              type="submit"
              className="text-xs font-bold text-brand-text hover:underline whitespace-nowrap"
            >
              Save
            </button>
          </label>
          <p id="documents-required-description" className="pl-14 text-sm text-stone-500">
            Customers sign when they register, and again whenever a version changes. With this off
            nobody is asked, and everything already signed stays on file.
          </p>
        </form>
      </PageSection>

      {config.featureWaiverRequired && live.length > 0 ? (
        <StatStrip
          stats={[
            { label: "Active customers", value: activeCustomers },
            { label: "Documents in use", value: live.length },
            {
              label: "Fully signed",
              value: <span className="text-green-700">{signedCurrent}</span>,
            },
            {
              label: "Awaiting a signature",
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
            {config.featureWaiverRequired
              ? "Nothing is switched on, so customers are not asked to sign anything yet."
              : "Signing is switched off — customers are not asked for anything."}
          </p>
        </PageSection>
      )}

      <PageSection padded={false} bodyClassName="divide-y divide-stone-100">
        {documents.map((document) => {
          const history = revisions.filter((revision) => revision.documentId === document.id);
          const signed = accepted.get(`${document.id}@${document.version}`) ?? 0;
          return (
            <details key={document.id} className="disclosure px-3 py-2" open={!document.body}>
              <summary>
                <span className="text-sm font-bold text-stone-800">{document.title}</span>
                <span className="block text-xs text-stone-500">
                  {KIND_LABELS[document.kind]} · version {document.version} · {signed} signature
                  {signed === 1 ? "" : "s"}
                  {document.isActive ? "" : " · switched off"}
                  {document.body ? "" : " · nothing written yet"}
                </span>
              </summary>

              <form action={saveDocument} className="mt-3 space-y-3">
                <input type="hidden" name="documentId" value={document.id} />
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-sm flex-1 min-w-48">
                    <span className="block text-stone-500 mb-1">Name</span>
                    <input
                      name="title"
                      defaultValue={document.title}
                      required
                      className="w-full border border-stone-200 rounded-lg px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-stone-700 pb-1.5">
                    <input
                      type="checkbox"
                      name="isActive"
                      defaultChecked={document.isActive}
                      className="accent-amber-700"
                    />
                    Ask customers to sign it
                  </label>
                </div>

                <VersionField
                  currentVersion={document.version}
                  nextVersion={nextVersions.get(document.id) ?? document.version}
                />

                <label className="block text-sm">
                  <span className="block text-stone-500 mb-1">Text</span>
                  <textarea
                    name="body"
                    defaultValue={document.body}
                    rows={14}
                    placeholder="The full text. Customers read and sign this before their first appointment…"
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-mono leading-relaxed"
                  />
                  <span className="block text-xs text-stone-400 mt-1">
                    Plain text. Line breaks are kept when it is shown to customers.
                  </span>
                </label>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-bold transition-colors"
                  >
                    Save {document.title}
                  </button>
                </div>
              </form>

              {history.length > 0 && (
                <ul className="mt-3 divide-y divide-stone-100 rounded-lg bg-well">
                  {history.map((revision) => {
                    const count = accepted.get(`${document.id}@${revision.version}`) ?? 0;
                    const isCurrent = revision.version === document.version;
                    return (
                      <li
                        key={revision.id}
                        className="flex items-center justify-between gap-3 px-3 py-2"
                      >
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
                            {revision.createdBy && ` by ${revision.createdBy.name}`} · {count}{" "}
                            signature{count === 1 ? "" : "s"}
                          </span>
                        </div>
                        {!isCurrent && (
                          <form action={restoreRevision}>
                            <input type="hidden" name="documentId" value={document.id} />
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
                </ul>
              )}
            </details>
          );
        })}
      </PageSection>

      <PageSection tone="muted">
        <form action={addDocument} className="flex flex-wrap items-end gap-3">
          <label className="text-sm flex-1 min-w-48">
            <span className="block text-stone-500 mb-1">Add a document</span>
            <input
              name="title"
              required
              placeholder="Matting release"
              className="w-full border border-stone-200 rounded-lg px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="block text-stone-500 mb-1">What it is</span>
            <select
              name="kind"
              defaultValue={ShopDocumentKind.OTHER}
              className="border border-stone-200 rounded-lg px-2 py-1.5 text-sm"
            >
              {Object.values(ShopDocumentKind).map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
          >
            Add
          </button>
        </form>
      </PageSection>

      <PageSection tone="muted">
        <ul className="text-sm text-stone-500 space-y-1 list-disc list-inside">
          <li>Every signature is stored with its timestamp, the version signed, the typed name, the drawing if one was made, and the signing IP.</li>
          <li>Switching a document off leaves the signatures already given untouched.</li>
          <li>A document with no text is never shown, whatever its switch says — there would be nothing to sign.</li>
          <li>Every published version is kept, so an earlier document can be restored under its original number.</li>
        </ul>
      </PageSection>
    </section>
  );
}
