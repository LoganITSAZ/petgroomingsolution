/**
 * Every switchable feature, declared once.
 *
 * A flag used to be four hand-maintained copies: the `SystemConfig` column, an
 * allowlist entry, a row in the settings form, and each gate that read it.
 * This is the one list they all read instead.
 *
 * Two rules keep it honest:
 *
 * - **A key is a column name.** `config[key]` therefore typechecks against the
 *   Prisma row, and a typo is a compile error rather than a flag that is
 *   quietly false forever.
 * - **Prefer emptiness to a flag.** A flag is for what a shop decides by
 *   policy — rewards, SMS, the waiver. What varies by *size* needs no setting:
 *   no kennel rows means no kennel UI, and the screens already skip an empty
 *   station role. A solo groomer should not have to switch off a shop they do
 *   not run.
 *
 * No Prisma import: the module takes the config as an argument so it stays
 * pure and testable, the same way `compartmentRoom()` takes numbers.
 */

export type FeatureKey =
  | "featureOnlineBooking"
  | "featureWalkInPortal"
  | "featureEmailNotify"
  | "featureSmsNotify"
  | "featureWaiverRequired"
  | "featureRewards";

export type FeatureGroup = "Customers" | "Notifications" | "Compliance";

/** Group order on the settings screen. */
export const FEATURE_GROUPS: FeatureGroup[] = ["Customers", "Notifications", "Compliance"];

/**
 * The columns this module reads — a structural subset of `SystemConfig`, so a
 * Prisma row satisfies it and a test can pass a literal.
 */
export interface FeatureConfig {
  featureOnlineBooking: boolean;
  featureWalkInPortal: boolean;
  featureEmailNotify: boolean;
  featureSmsNotify: boolean;
  featureWaiverRequired: boolean;
  featureRewards: boolean;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioFromNumber: string | null;
  waiverText: string | null;
}

/**
 * What switching a feature off does to data already written.
 *
 * - `accrues` — rows keep being written, only the display is gated, so turning
 *   it back on has history behind it.
 * - `silent`  — emits nothing, and there was nothing to accrue.
 * - `frozen`  — what is written stays readable, new writes stop, nothing is
 *   deleted.
 */
export type OffMeans = "accrues" | "silent" | "frozen";

export interface Feature {
  key: FeatureKey;
  /** The same words as the screen it governs — one screen, one name. */
  label: string;
  /** One line: what turning it off does to the shop. */
  blurb: string;
  group: FeatureGroup;
  offMeans: OffMeans;
  /** Other flags that must be on first. */
  requires?: FeatureKey[];
  /** Configuration the feature cannot work without, named rather than guessed. */
  needs?: (config: FeatureConfig) => string | null;
}

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export const FEATURES: Feature[] = [
  {
    key: "featureOnlineBooking",
    label: "Online Booking",
    blurb: "Customers book their own appointments in the portal. Off, staff take every booking.",
    group: "Customers",
    offMeans: "silent",
  },
  {
    key: "featureWalkInPortal",
    label: "Walk-In Check-In Portal",
    blurb: "Customers register their own arrival. Off, the counter checks walk-ins in.",
    group: "Customers",
    offMeans: "silent",
  },
  {
    key: "featureRewards",
    label: "Customer Rewards",
    blurb:
      "A punch card: every finished visit is a punch, and a set number of them earns a reward. Punches accrue while this is off, so switching it on does not start the regulars at zero.",
    group: "Customers",
    offMeans: "accrues",
  },
  {
    key: "featureEmailNotify",
    label: "Email Notifications",
    blurb: "Booking confirmations and the ready-for-pickup email. Off, nothing is sent.",
    group: "Notifications",
    offMeans: "silent",
  },
  {
    key: "featureSmsNotify",
    label: "SMS Notifications",
    blurb: "Text messages to customers. Off, nothing is sent.",
    group: "Notifications",
    offMeans: "silent",
    needs: (config) =>
      filled(config.twilioAccountSid) &&
      filled(config.twilioAuthToken) &&
      filled(config.twilioFromNumber)
        ? null
        : "Twilio credentials are missing — add them on the Notifications page.",
  },
  {
    key: "featureWaiverRequired",
    label: "Liability Waiver",
    blurb:
      "New customers sign the waiver before their first visit. Off, nobody is asked again; waivers already signed stay on file.",
    group: "Compliance",
    offMeans: "frozen",
    needs: (config) =>
      filled(config.waiverText)
        ? null
        : "There is no waiver text to show — write it on the Waiver page.",
  },
];

function feature(key: FeatureKey): Feature {
  const found = FEATURES.find((candidate) => candidate.key === key);
  // Unreachable while FeatureKey and FEATURES agree, which the integrity test
  // asserts. Throwing beats returning a fake feature that reads as disabled.
  if (!found) throw new Error(`Unknown feature: ${key}`);
  return found;
}

/**
 * Why a feature is not live *despite its switch being on*.
 *
 * A switch that is simply off is not a blocker: the screen already shows the
 * switch. Empty means nothing is in the way.
 */
export function featureBlockers(config: FeatureConfig, key: FeatureKey): string[] {
  const self = feature(key);
  if (!config[key]) return [];

  const blockers: string[] = [];
  for (const required of self.requires ?? []) {
    if (!isEnabled(config, required)) {
      blockers.push(`${feature(required).label} has to be on first.`);
    }
  }
  const missing = self.needs?.(config) ?? null;
  if (missing) blockers.push(missing);
  return blockers;
}

/** The column is on, every required flag is live, and nothing is missing. */
export function isEnabled(config: FeatureConfig, key: FeatureKey): boolean {
  return config[key] && featureBlockers(config, key).length === 0;
}

/**
 * Features that go off with this one, so a save can say so rather than leave
 * an orphan switch on describing something that cannot run.
 */
export function dependents(key: FeatureKey): FeatureKey[] {
  return FEATURES.filter((candidate) => (candidate.requires ?? []).includes(key)).map(
    (candidate) => candidate.key
  );
}

/** The registry in display order, grouped, dropping groups nothing is in. */
export function featuresByGroup(): { group: FeatureGroup; features: Feature[] }[] {
  return FEATURE_GROUPS.map((group) => ({
    group,
    features: FEATURES.filter((candidate) => candidate.group === group),
  })).filter((entry) => entry.features.length > 0);
}
