import { Species, type VaccineRequirement } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { requireFeature, requireManager } from "@/lib/auth-guards";
import { formatSpecies } from "@/lib/utils";
import { PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";

/**
 * What the shop checks before it takes a pet.
 *
 * This had its own /admin/vaccinations screen. It is shop configuration like
 * any other — the two knobs that decide what happens to a lapsed pet already
 * sit in the Vaccinations section of this form — so it is a band on this page
 * rather than a twelfth row in the sidebar. Per-pet records stay where they
 * are read: the pet's profile.
 *
 * The list is rows rather than a fixed set of switches: a shop that asks only
 * for rabies has one row, and a shop that asks for nothing has none — which is
 * the whole gate, off, without a second setting to find.
 */

const ERRORS: Record<string, string> = {
  name_required: "A requirement needs a name.",
  duplicate: "That vaccine is already on the list for that species.",
};

function done(params: string): never {
  revalidatePath("/admin/settings");
  revalidatePath("/staff/pets");
  redirect(`/admin/settings${params}#vaccinations`);
}

/**
 * Add or rename one thing the shop checks.
 *
 * A server action is its own endpoint, so both the role and the feature are
 * re-checked here — the section hiding itself is presentation.
 */
async function saveRequirement(formData: FormData): Promise<void> {
  "use server";
  await requireManager();
  await requireFeature("featureVaccinationGate");

  const id = ((formData.get("id") as string | null) ?? "").trim();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) done("?vaccineError=name_required");

  const speciesRaw = ((formData.get("species") as string | null) ?? "").trim();
  // Object.hasOwn, never `in`: "toString" is not a species.
  const species = Object.hasOwn(Species, speciesRaw)
    ? (speciesRaw as Species)
    : Species.DOG;
  const sortRaw = ((formData.get("sortOrder") as string | null) ?? "").trim();
  const sortOrder = Number.isInteger(Number(sortRaw)) ? Number(sortRaw) : 0;

  const clash = await prisma.vaccineRequirement.findUnique({
    where: { name_species: { name, species } },
  });
  if (clash && clash.id !== id) done("?vaccineError=duplicate");

  if (id) {
    await prisma.vaccineRequirement.update({ where: { id }, data: { name, species, sortOrder } });
  } else {
    await prisma.vaccineRequirement.create({ data: { name, species, sortOrder } });
  }
  done(`?vaccineSaved=${encodeURIComponent(name)}`);
}

/**
 * Retire or restore a requirement.
 *
 * Retiring rather than deleting is the point: the records already on file stay
 * readable, and a shop that stops checking something can start again without
 * asking every owner for a certificate twice.
 */
async function setRequirementActive(formData: FormData): Promise<void> {
  "use server";
  await requireManager();
  await requireFeature("featureVaccinationGate");

  const id = (formData.get("id") as string | null) ?? "";
  const isActive = formData.get("isActive") === "on";
  await prisma.vaccineRequirement.update({ where: { id }, data: { isActive } });
  done(isActive ? "?vaccineRestored=1" : "?vaccineRetired=1");
}

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
  searchParams: Promise<{
    vaccineSaved?: string;
    vaccineRetired?: string;
    vaccineRestored?: string;
    vaccineError?: string;
  }>;
}

export default async function VaccineRequirements(props: PageProps) {
  const config = await getConfig();
  if (!isEnabled(config, "featureVaccinationGate")) return null;

  const searchParams = await props.searchParams;
  const requirements = await prisma.vaccineRequirement.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  const live = requirements.filter((requirement) => requirement.isActive).length;
  const errorMessage = searchParams.vaccineError ? ERRORS[searchParams.vaccineError] : undefined;

  return (
    <section id="vaccinations" aria-label="What the shop checks" className="scroll-mt-4">
      <PageSection title="What The Shop Checks" tone="muted">
        <p className="text-sm text-stone-500">
          {live === 0
            ? "Nothing is checked yet. Until a vaccine is on this list, no pet is asked for one."
            : `${live} checked before a pet is taken. Records are kept per pet, with the expiry off the certificate, on the pet's profile.`}
        </p>
      </PageSection>

      {searchParams.vaccineSaved && <SaveToast message={`Saved ${searchParams.vaccineSaved}`} />}
      {searchParams.vaccineRetired === "1" && (
        <SaveToast message="Retired" detail="The records already on file are kept." />
      )}
      {searchParams.vaccineRestored === "1" && <SaveToast message="Back in force" />}
      {errorMessage && <SaveToast tone="error" message="Nothing was saved" detail={errorMessage} />}

      <details className="border-t border-stone-100 disclosure">
        <summary className="px-3 py-2 cursor-pointer text-sm font-semibold text-stone-800">
          Check another vaccine
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
        <PageSection className="text-center text-stone-400 text-sm">
          Nothing on the list yet.
        </PageSection>
      ) : (
        <PageSection padded={false} bodyClassName="divide-y divide-stone-100">
          {requirements.map((requirement) => (
            <details key={requirement.id} className="disclosure">
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
    </section>
  );
}
