import {
  VACCINE_LEVEL_CLASS,
  VACCINE_LEVEL_LABEL,
  type VaccineCheck,
  vaccinationBlockers,
  worstLevel,
} from "@/lib/vaccinations";
import { formatShopDate } from "@/lib/utils";

/**
 * What the shop checks, rendered the same way everywhere it is read.
 *
 * Both of these render nothing at all for an empty list, which is what
 * `checksForPet()` returns when the feature is off or the shop checks nothing —
 * so a surface embeds them without asking whether the feature is live.
 */

/** Every requirement and where this pet stands on it. */
export function VaccinationRows({ checks }: { checks: VaccineCheck[] }) {
  if (checks.length === 0) return null;

  return (
    <ul className="divide-y divide-stone-100 text-sm">
      {checks.map((check) => (
        <li key={check.requirementId} className="flex items-center justify-between gap-3 py-1.5">
          <span className="font-medium text-stone-800">{check.name}</span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            {check.expiresOn && (
              <span className="text-xs text-stone-500">
                {check.daysLeft !== null && check.daysLeft < 0 ? "expired " : "expires "}
                {formatShopDate(check.expiresOn)}
              </span>
            )}
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                VACCINE_LEVEL_CLASS[check.level]
              }`}
            >
              {VACCINE_LEVEL_LABEL[check.level]}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One line for a screen that is about something else — a visit, the booking
 * form, the station job aid.
 *
 * A pet that is fine says nothing: a banner that is always there is one nobody
 * reads. `blocks` is not consulted, because grace decides what is refused and
 * the floor still wants to know the shot has lapsed.
 */
export function VaccinationWarning({
  checks,
  petName,
}: {
  checks: VaccineCheck[];
  petName?: string;
}) {
  const worst = worstLevel(checks);
  if (worst === null || worst === "current") return null;

  const wrong = checks.filter((check) => check.level !== "current");
  const blocked = vaccinationBlockers(checks).length > 0;
  const subject = petName ? `${petName} is` : "This pet is";

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${VACCINE_LEVEL_CLASS[worst]}`}
      role={blocked ? "alert" : undefined}
    >
      <span className="font-semibold">
        {worst === "expiring" ? `${subject} due a booster` : `${subject} not current`}
      </span>{" "}
      {wrong
        .map((check) => `${check.name} (${VACCINE_LEVEL_LABEL[check.level].toLowerCase()})`)
        .join(", ")}
      .
    </div>
  );
}
