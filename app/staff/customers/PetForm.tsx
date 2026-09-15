import { prisma } from "@/lib/prisma";
import { CoatType, Species } from "@prisma/client";
import { formatSpecies, formatCoatType, formatShopDate } from "@/lib/utils";
import TagPicker from "@/components/TagPicker";
import { HEALTH_FLAG_PRESETS } from "@/lib/pet-schema";
import { savePet } from "./actions";

/**
 * The flags offered as chips: the common ones plus every flag this shop has
 * already written on a pet, so a flag typed once is a click from then on.
 *
 * `healthFlags` is a Postgres array, which Prisma cannot select distinct
 * elements of — hence `unnest`.
 */
export async function healthFlagOptions(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ flag: string }[]>`
    SELECT DISTINCT unnest("healthFlags") AS flag FROM pets ORDER BY 1
  `;
  const used = rows.map((row) => row.flag);
  return [...new Set([...HEALTH_FLAG_PRESETS, ...used])];
}

/** Add or edit a pet. No `pet` is the add case — the action reads it the same way. */
export function PetForm({
  customerId,
  pet,
  flagOptions,
  returnToPet = false,
}: {
  customerId: string;
  returnToPet?: boolean;
  /** Preset health flags: the common ones plus what this shop already uses. */
  flagOptions: string[];
  pet?: {
    id: string;
    name: string;
    species: Species;
    breed: string | null;
    weightLbs: number | null;
    coatType: CoatType | null;
    groomingNotes: string | null;
    temperamentNotes: string | null;
    healthFlags: string[];
    vaccinationsConfirmedAt: Date | null;
    vetName: string | null;
    vetPhone: string | null;
  };
}) {
  return (
    <form action={savePet} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      {returnToPet && <input type="hidden" name="returnToPet" value="1" />}
      {pet && <input type="hidden" name="petId" value={pet.id} />}
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Name</span>
        <input
          name="name"
          required
          defaultValue={pet?.name ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Species</span>
        <select
          name="species"
          defaultValue={pet?.species ?? Species.DOG}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          {Object.values(Species).map((species) => (
            <option key={species} value={species}>
              {formatSpecies(species)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Breed</span>
        <input
          name="breed"
          defaultValue={pet?.breed ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Weight (lbs)</span>
        <input
          name="weightLbs"
          type="number"
          min="1"
          step="0.1"
          defaultValue={pet?.weightLbs ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="block text-stone-500 mb-1">Coat</span>
        <select
          name="coatType"
          defaultValue={pet?.coatType ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm bg-white"
        >
          <option value="">Not recorded</option>
          {Object.values(CoatType).map((coat) => (
            <option key={coat} value={coat}>
              {formatCoatType(coat)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm sm:col-span-2 flex items-start gap-2 rounded-lg border border-stone-200 bg-well px-3 py-2">
        <input
          type="checkbox"
          name="vaccinationsConfirmed"
          defaultChecked={pet?.vaccinationsConfirmedAt != null}
          className="mt-0.5 h-4 w-4 accent-amber-600"
        />
        <span>
          <span className="block text-stone-700 font-medium">Vaccinations confirmed</span>
          <span className="block text-xs text-stone-500">
            {pet?.vaccinationsConfirmedAt
              ? `Confirmed ${formatShopDate(pet.vaccinationsConfirmedAt)}. Unticking clears it.`
              : "Tick once the shop has seen the records. Saves today's date."}
          </span>
        </span>
      </label>
      <div className="text-sm sm:col-span-2">
        <span className="block text-stone-500 mb-1">Health flags</span>
        <TagPicker
          name="healthFlags"
          initialIds={pet?.healthFlags ?? []}
          options={flagOptions.map((flag) => ({ id: flag, label: flag }))}
          optionsLabel="Common flags"
          emptyLabel="None on file"
          noun="health flag"
          required={false}
          allowCustom
          customPlaceholder="Type a flag, press Enter"
        />
        <p className="text-xs text-stone-400 mt-1">
          Shown to the groomer on the visit and station screens.
        </p>
      </div>
      <label className="text-sm sm:col-span-2">
        <span className="block text-stone-500 mb-1">Grooming notes</span>
        <textarea
          name="groomingNotes"
          rows={2}
          defaultValue={pet?.groomingNotes ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm resize-y"
        />
      </label>
      {/* The number to ring when something is wrong with the pet rather than
          the groom. Kept beside the notes a groomer reads, not buried with the
          owner's own details. */}
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Vet</span>
        <input
          name="vetName"
          defaultValue={pet?.vetName ?? ""}
          placeholder="Practice or vet's name"
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        <span className="block text-stone-500 mb-1">Vet phone</span>
        <input
          name="vetPhone"
          type="tel"
          defaultValue={pet?.vetPhone ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="block text-stone-500 mb-1">Temperament notes</span>
        <textarea
          name="temperamentNotes"
          rows={2}
          defaultValue={pet?.temperamentNotes ?? ""}
          className="w-full border border-stone-300 rounded-lg px-2 py-1.5 text-sm resize-y"
        />
      </label>
      <div className="sm:col-span-2 flex justify-end">
        <button
          type="submit"
          className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
        >
          Save
        </button>
      </div>
    </form>
  );
}

