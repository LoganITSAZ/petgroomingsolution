import { Species } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { shopDayKey } from "@/lib/utils";

/**
 * Is this pet current on what the shop checks?
 *
 * The shop's requirements are rows, not a flag list, so a shop that checks
 * nothing has no rows and this answers "nothing to say" -- the emptiness rule
 * from the feature registry. A shop that checks only rabies has one row.
 *
 * The decisions here are pure; the queries at the bottom feed them. Levels and
 * blockers are deliberately separate: a screen shows what is wrong, the gate
 * decides what is fatal, and the grace period moves only the second.
 */

export type VaccineLevel = "current" | "undated" | "expiring" | "lapsed" | "missing";

/** Worst first, so `worstLevel()` is a scan rather than a pile of ifs. */
const LEVEL_SEVERITY: Record<VaccineLevel, number> = {
  missing: 4,
  lapsed: 3,
  undated: 2,
  expiring: 1,
  current: 0,
};

/**
 * How near an expiry starts reading as "ask the owner". Not a setting: it
 * changes nothing about what is allowed, only when the shop starts asking,
 * and a shop with an opinion about that is really asking for grace days.
 */
export const EXPIRING_SOON_DAYS = 30;

export const VACCINE_LEVEL_LABEL: Record<VaccineLevel, string> = {
  current: "Current",
  undated: "No expiry on file",
  expiring: "Expiring soon",
  lapsed: "Lapsed",
  missing: "Not on file",
};

export const VACCINE_LEVEL_CLASS: Record<VaccineLevel, string> = {
  current: "bg-green-50 text-green-800 border-green-200",
  undated: "bg-stone-50 text-stone-700 border-stone-200",
  expiring: "bg-amber-50 text-amber-800 border-amber-200",
  lapsed: "bg-red-50 text-red-800 border-red-200",
  missing: "bg-red-50 text-red-800 border-red-200",
};

export interface VaccineCheck {
  requirementId: string;
  name: string;
  level: VaccineLevel;
  expiresOn: Date | null;
  /** Days until expiry, negative once lapsed. Null when undated or missing. */
  daysLeft: number | null;
  /** True once the lapse is past the shop's grace period. */
  blocks: boolean;
}

export interface VaccineRequirementLike {
  id: string;
  name: string;
  species: Species;
}

export interface VaccineRecordLike {
  requirementId: string;
  expiresOn: Date | null;
}

/**
 * Shop-local calendar days between two instants.
 *
 * Both sides go through `shopDayKey()` first. An expiry is a date on a
 * certificate, not a moment, so comparing instants would make a shot expire
 * at a different hour depending on where the server runs.
 */
function dayDiff(from: Date, to: Date): number {
  const asDay = (at: Date) => {
    const [year, month, day] = shopDayKey(at).split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((asDay(to) - asDay(from)) / 86_400_000);
}

/** One pet against the shop's requirements for its species. */
export function checkVaccinations(input: {
  requirements: VaccineRequirementLike[];
  records: VaccineRecordLike[];
  species: Species;
  today: Date;
  graceDays: number;
}): VaccineCheck[] {
  const grace = Math.max(0, Math.floor(input.graceDays));

  return input.requirements
    .filter((requirement) => requirement.species === input.species)
    .map((requirement) => {
      const record = input.records.find((row) => row.requirementId === requirement.id);

      if (!record) {
        return {
          requirementId: requirement.id,
          name: requirement.name,
          level: "missing" as const,
          expiresOn: null,
          daysLeft: null,
          // Nothing on file blocks outright: there is no lapse to forgive.
          blocks: true,
        };
      }

      if (!record.expiresOn) {
        // Proof was seen and no date was written down. It counts as current --
        // refusing the pet would punish the owner for the shop's paperwork --
        // but it is flagged so somebody asks for the certificate again.
        return {
          requirementId: requirement.id,
          name: requirement.name,
          level: "undated" as const,
          expiresOn: null,
          daysLeft: null,
          blocks: false,
        };
      }

      const daysLeft = dayDiff(input.today, record.expiresOn);
      // Expiry day itself still counts: a certificate reading "expires 14 Sep"
      // is good on the 14th.
      const level: VaccineLevel =
        daysLeft < 0 ? "lapsed" : daysLeft <= EXPIRING_SOON_DAYS ? "expiring" : "current";

      return {
        requirementId: requirement.id,
        name: requirement.name,
        level,
        expiresOn: record.expiresOn,
        daysLeft,
        blocks: daysLeft < -grace,
      };
    });
}

/** What stops a booking: lapsed past the grace, or never recorded. */
export function vaccinationBlockers(checks: VaccineCheck[]): VaccineCheck[] {
  return checks.filter((check) => check.blocks);
}

/** The worst level present, for a badge. Null when there is nothing to say. */
export function worstLevel(checks: VaccineCheck[]): VaccineLevel | null {
  let worst: VaccineLevel | null = null;
  for (const check of checks) {
    if (worst === null || LEVEL_SEVERITY[check.level] > LEVEL_SEVERITY[worst]) {
      worst = check.level;
    }
  }
  return worst;
}

/** One line for a banner: which vaccines are in the way. */
export function vaccinationRefusalMessage(blockers: VaccineCheck[], petName: string): string {
  const names = blockers.map((check) => check.name).join(", ");
  return `${petName} is not current on ${names}. Bring proof of vaccination, or call the shop.`;
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** The requirements in force, in the order the shop arranged them. */
export function activeRequirements() {
  return prisma.vaccineRequirement.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, species: true },
  });
}

/**
 * One pet's checks, resolved against the shop's settings.
 *
 * Returns an empty list when the feature is off or the shop has no
 * requirements -- both mean "the shop does not check", and a caller can render
 * nothing without asking which of the two it was.
 */
export async function checksForPet(
  petId: string,
  config: { featureVaccinationGate: boolean; vaccinationGraceDays: number },
  now: Date = new Date()
): Promise<VaccineCheck[]> {
  if (!config.featureVaccinationGate) return [];

  const [requirements, pet] = await Promise.all([
    activeRequirements(),
    prisma.pet.findUnique({
      where: { id: petId },
      select: {
        species: true,
        vaccinations: { select: { requirementId: true, expiresOn: true } },
      },
    }),
  ]);
  if (!pet || requirements.length === 0) return [];

  return checkVaccinations({
    requirements,
    records: pet.vaccinations,
    species: pet.species,
    today: now,
    graceDays: config.vaccinationGraceDays,
  });
}

/**
 * Checks for several pets at once -- two queries for a whole board rather than
 * two per row, the same rule as `rewardCards()`.
 */
export async function checksForPets(
  petIds: string[],
  config: { featureVaccinationGate: boolean; vaccinationGraceDays: number },
  now: Date = new Date()
): Promise<Map<string, VaccineCheck[]>> {
  const unique = [...new Set(petIds)];
  const empty = new Map<string, VaccineCheck[]>();
  if (!config.featureVaccinationGate || unique.length === 0) return empty;

  const [requirements, pets] = await Promise.all([
    activeRequirements(),
    prisma.pet.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        species: true,
        vaccinations: { select: { requirementId: true, expiresOn: true } },
      },
    }),
  ]);
  if (requirements.length === 0) return empty;

  const byPet = new Map<string, VaccineCheck[]>();
  for (const pet of pets) {
    byPet.set(
      pet.id,
      checkVaccinations({
        requirements,
        records: pet.vaccinations,
        species: pet.species,
        today: now,
        graceDays: config.vaccinationGraceDays,
      })
    );
  }
  return byPet;
}
