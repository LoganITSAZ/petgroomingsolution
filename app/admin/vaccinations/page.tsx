import Link from "next/link";
import { redirect } from "next/navigation";
import { Species, type VaccineRequirement } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { formatSpecies } from "@/lib/utils";
import { PageShell, PageSection } from "@/components/ui";
import { saveRequirement, setRequirementActive } from "./actions";

export const metadata = { title: "Vaccinations" };

/**
 * What the shop checks before it takes a pet.
 *
 * The list is rows rather than a fixed set of switches: a shop that asks only
 * for rabies has one row, and a shop that asks for nothing has none — which is
 * the whole gate, off, without a second setting to find.
 */

const ERRORS: Record<string, string> = {
  name_required: "A requirement needs a name.",
  duplicate: "That vaccine is already on the list for that species.",
};

const inputClass = "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm ";

function RequirementFields({ requirement }: { requirement?: VaccineRequirement }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label className="text-sm">
        <span className="block font-medium text-stone-700 mb-1">Vaccine</span>
        <input
          name="name"
          required
          defaultValue={requirement?.name ?? ""}
          placeholder="Rabies"
          className={inputClass}
        />
      </label>
      <label className="text-sm">
        <span className="block font-medium text-stone-700 mb-1">Species</span>
        <select
          name="species"
          defaultValue={requirement?.species ?? Species.DOG}
          className={inputClass}
        >
          {Object.values(Species).map((species) => (
            <option key={species} value={species}>
              {formatSpecies(species)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block font-medium text-stone-700 mb-1">Order</span>
        <input
          name="sortOrder"
          inputMode="numeric"
          defaultValue={requirement?.sortOrder ?? 0}
          className={inputClass}
        />
      </label>
    </div>
  );
}

interface PageProps {
  searchParams: Promise<{ saved?: string; retired?: string; restored?: string; error?: string }>;
}

export default async function VaccinationsPage(props: PageProps) {
  const config = await getConfig();
  // The page redirects itself: hiding the sidebar link is presentation.
  if (!isEnabled(config, "featureVaccinationGate")) redirect("/admin/settings");

  const searchParams = await props.searchParams;
  const requirements = await prisma.vaccineRequirement.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  const live = requirements.filter((requirement) => requirement.isActive).length;
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <PageShell
      title="Vaccinations"
      subtitle={
        live === 0
          ? "Nothing is checked yet. Until a vaccine is on this list, no pet is asked for one."
          : `${live} checked before a pet is taken. Records are kept per pet with the expiry off the certificate.`
      }
    >
      {searchParams.saved && (
        <p className="border-t border-stone-100 bg-green-50 text-green-800 px-3 py-2 text-sm font-medium">
          Saved {searchParams.saved}.
        </p>
      )}
      {searchParams.retired === "1" && (
        <p className="border-t border-stone-100 bg-green-50 text-green-800 px-3 py-2 text-sm font-medium">
          Retired. The records already on file are kept.
        </p>
      )}
      {searchParams.restored === "1" && (
        <p className="border-t border-stone-100 bg-green-50 text-green-800 px-3 py-2 text-sm font-medium">
          Back in force.
        </p>
      )}
      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 text-red-800 px-3 py-2 text-sm font-medium">
          {errorMessage}
        </p>
      )}

      <PageSection tone="muted" className="text-xs text-stone-500">
        {config.vaccinationGateBlocks
          ? "An online booking is refused for a pet that is not current."
          : "An online booking goes through and the shop is warned on the visit."}{" "}
        {config.vaccinationGraceDays > 0
          ? `${config.vaccinationGraceDays} days of grace after an expiry.`
          : "No grace after an expiry."}{" "}
        Both are set in{" "}
        <Link
          href="/admin/settings"
          className="text-amber-700 hover:text-amber-900 underline"
        >
          Shop Settings
        </Link>
        . Staff at the counter are never refused.
      </PageSection>

      <details className="border-t border-stone-100">
        <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-stone-800">
          + Check another vaccine
        </summary>
        <form action={saveRequirement} className="px-3 pb-3 pt-1 border-t border-stone-100 space-y-3">
          <RequirementFields />
          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Add Requirement
            </button>
          </div>
        </form>
      </details>

      {requirements.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          Nothing on the list yet.
        </PageSection>
      ) : (
        <PageSection grow scroll padded={false} bodyClassName="divide-y divide-stone-100">
          {requirements.map((requirement) => (
            <details key={requirement.id}>
              <summary className="px-3 py-2 cursor-pointer flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="font-semibold text-stone-900">{requirement.name}</span>
                  <span className="block text-xs text-stone-400">
                    {formatSpecies(requirement.species)}
                    {!requirement.isActive && " · retired"}
                  </span>
                </span>
                {!requirement.isActive && (
                  <span className="text-xs text-stone-400 whitespace-nowrap">Not checked</span>
                )}
              </summary>
              <div className="px-3 pb-3 border-t border-stone-100 pt-3 space-y-3">
                <form action={saveRequirement} className="space-y-3">
                  <input type="hidden" name="id" value={requirement.id} />
                  <RequirementFields requirement={requirement} />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-2 rounded-lg text-sm font-semibold"
                    >
                      Save
                    </button>
                  </div>
                </form>
                <form action={setRequirementActive} className="flex justify-end">
                  <input type="hidden" name="id" value={requirement.id} />
                  {!requirement.isActive && <input type="hidden" name="isActive" value="on" />}
                  <button
                    type="submit"
                    className="text-xs text-stone-400 hover:text-stone-800 underline"
                  >
                    {requirement.isActive
                      ? "Stop checking this (records are kept)"
                      : "Check this again"}
                  </button>
                </form>
              </div>
            </details>
          ))}
        </PageSection>
      )}
    </PageShell>
  );
}
