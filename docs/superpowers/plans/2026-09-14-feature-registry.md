# Feature Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declare each of the shop's feature flags once, in one typed registry, so the settings screen, the gates and the docs read from a single list instead of four hand-maintained copies.

**Architecture:** A pure module (`lib/features.ts`) holds the registry and three functions over it. Feature keys are *identical* to the `SystemConfig` boolean column names, so `config[key]` typechecks against the Prisma type and all 15 files that read a flag column today keep working untouched. The module imports no Prisma and takes a structural config object, matching how `lib/kennels.ts` keeps `compartmentRoom()` free of the database. One guard (`requireFeature`) and one rendering change (`/admin/settings`) consume it; one dead route is deleted.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Prisma/PostgreSQL, Vitest, Tailwind.

**Spec:** [docs/superpowers/specs/2026-09-14-feature-registry-design.md](../specs/2026-09-14-feature-registry-design.md)

## Global Constraints

- No migration, no new column, no behaviour change for a shop on defaults. This is a substrate change.
- Feature keys must be spelled exactly as the `SystemConfig` columns: `featureOnlineBooking`, `featureWalkInPortal`, `featureEmailNotify`, `featureSmsNotify`, `featureWaiverRequired`, `featureRewards`.
- `lib/features.ts` imports nothing from `@prisma/client` and nothing from `@/lib/prisma`. It takes config as an argument.
- The 15 files that read a flag column today are **not** touched. `config.featureRewards` stays valid.
- `npx tsc --noEmit` clean and `npm test` green after every task. `next lint` covers test files, so no unused imports in them.
- Import alias is `@/*` → repo root.
- `/admin/settings` threshold inputs and their save-action parsing are out of scope — they are numbers a feature runs on, not features.
- Commit after each task. Branch is `feat/feature-registry`, already created.

---

### Task 1: The registry module

**Files:**
- Create: `lib/features.ts`
- Create: `lib/features.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FeatureKey` (union of the six column names), `FeatureGroup`, `FeatureConfig`, `Feature`, `FEATURES: Feature[]`, `isEnabled(config, key): boolean`, `featureBlockers(config, key): string[]`, `dependents(key): FeatureKey[]`, `featuresByGroup(): { group: FeatureGroup; features: Feature[] }[]`.

- [ ] **Step 1: Write failing tests**

Create `lib/features.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FEATURES,
  type FeatureConfig,
  type FeatureKey,
  dependents,
  featureBlockers,
  featuresByGroup,
  isEnabled,
} from "./features";

/** A shop with everything switched on and every precondition satisfied. */
function configured(overrides: Partial<FeatureConfig> = {}): FeatureConfig {
  return {
    featureOnlineBooking: true,
    featureWalkInPortal: true,
    featureEmailNotify: true,
    featureSmsNotify: true,
    featureWaiverRequired: true,
    featureRewards: true,
    twilioAccountSid: "AC_test",
    twilioAuthToken: "token",
    twilioFromNumber: "+15550000000",
    waiverText: "Sign here.",
    ...overrides,
  };
}

describe("registry integrity", () => {
  it("declares every key exactly once", () => {
    const keys = FEATURES.map((feature) => feature.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(6);
  });

  it("only names declared keys in requires", () => {
    const keys = new Set<FeatureKey>(FEATURES.map((feature) => feature.key));
    for (const feature of FEATURES) {
      for (const required of feature.requires ?? []) {
        expect(keys.has(required)).toBe(true);
      }
    }
  });

  it("gives every feature a label and a blurb", () => {
    for (const feature of FEATURES) {
      expect(feature.label.length).toBeGreaterThan(0);
      expect(feature.blurb.length).toBeGreaterThan(0);
    }
  });

  it("groups every feature, losing none", () => {
    const grouped = featuresByGroup().flatMap((group) => group.features);
    expect(grouped).toHaveLength(FEATURES.length);
  });
});

describe("isEnabled", () => {
  it("follows the column when everything is configured", () => {
    const config = configured();
    for (const feature of FEATURES) {
      expect(isEnabled(config, feature.key)).toBe(true);
    }
  });

  it("is false for a column that is off", () => {
    expect(isEnabled(configured({ featureRewards: false }), "featureRewards")).toBe(false);
  });

  // A shop may switch SMS on before pasting credentials. Intent is on; the
  // capability is not there, so nothing should claim it is live.
  it("is false when a precondition is missing though the column is true", () => {
    const config = configured({ twilioAuthToken: null });
    expect(config.featureSmsNotify).toBe(true);
    expect(isEnabled(config, "featureSmsNotify")).toBe(false);
  });

  it("is false for the waiver with no text to show", () => {
    expect(isEnabled(configured({ waiverText: null }), "featureWaiverRequired")).toBe(false);
  });

  it("treats whitespace-only waiver text as no waiver", () => {
    expect(isEnabled(configured({ waiverText: "   " }), "featureWaiverRequired")).toBe(false);
  });
});

describe("featureBlockers", () => {
  it("is empty for a feature that is live", () => {
    expect(featureBlockers(configured(), "featureSmsNotify")).toEqual([]);
  });

  it("names the missing configuration rather than only refusing", () => {
    const blockers = featureBlockers(configured({ twilioFromNumber: null }), "featureSmsNotify");
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/Twilio/);
  });

  it("says nothing about a feature whose own switch is off", () => {
    // Off by choice is not a blocker — the screen shows the switch position.
    expect(featureBlockers(configured({ featureSmsNotify: false }), "featureSmsNotify")).toEqual([]);
  });
});

describe("dependents", () => {
  it("returns nothing while no feature depends on another", () => {
    for (const feature of FEATURES) {
      expect(dependents(feature.key)).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/features.test.ts`
Expected: FAIL — `Failed to resolve import "./features"`.

- [ ] **Step 3: Write the module**

Create `lib/features.ts`:

```ts
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
      filled(config.waiverText) ? null : "There is no waiver text to show — write it on the Waiver page.",
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/features.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. If it reports TS2802 on `Set` iteration, delete `tsconfig.tsbuildinfo` and rerun — the config is fine, the cache is stale.

- [ ] **Step 6: Commit**

```bash
git add lib/features.ts lib/features.test.ts
git commit -m "$(cat <<'MSG'
feat(features): declare every switchable feature in one registry

A flag was four hand-maintained copies: the SystemConfig column, an
allowlist entry, a settings form row, and every gate that read it. This
is the one list they read instead, keyed on the column names so
config[key] stays typed and a typo is a compile error.

Two preconditions that were only comments in schema.prisma are now
functions that name what is missing: SMS needs Twilio credentials, and
the waiver flag needs waiver text.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: `requireFeature()` guard

**Files:**
- Modify: `lib/auth-guards.ts` (append after `requireAdmin()`, currently ends line 50)

**Interfaces:**
- Consumes: `isEnabled`, `FeatureKey` from Task 1; `getConfig()` from `@/lib/config`.
- Produces: `requireFeature(key: FeatureKey): Promise<void>` — throws `Error("Feature off")` when the feature is not live.

No test: this is three lines over two tested units (`isEnabled` in Task 1, `getConfig` already exercised everywhere), and there is no component or route testing in this codebase to hang a guard test on.

- [ ] **Step 1: Add the guard**

Append to `lib/auth-guards.ts`:

```ts
/**
 * Refuse a mutation belonging to a feature the shop has switched off.
 *
 * Hiding a link or a section is presentation. A server action is its own
 * endpoint, so a disabled feature whose action is still callable is only
 * disabled on screen — this is the gate underneath. Reads the config at
 * request time, never a build-time snapshot.
 */
export async function requireFeature(key: FeatureKey): Promise<void> {
  const config = await getConfig();
  if (!isEnabled(config, key)) {
    throw new Error("Feature off");
  }
}
```

Add to the imports at the top of the same file:

```ts
import { getConfig } from "@/lib/config";
import { isEnabled, type FeatureKey } from "@/lib/features";
```

- [ ] **Step 2: Typecheck and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: no tsc output; 40 files / 294 tests + Task 1's 13 = all passing.

- [ ] **Step 3: Commit**

```bash
git add lib/auth-guards.ts
git commit -m "$(cat <<'MSG'
feat(features): add requireFeature() beside the role guards

A server action is its own endpoint, so a feature that is off on screen
is still callable unless something underneath refuses. Same shape as
requireManager(): no arguments beyond the key, throws.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Settings screen renders from the registry

**Files:**
- Modify: `app/admin/settings/page.tsx` — the save action's flag block (lines 46–50 and the corresponding entries in the `data` object at lines 96–100), and the `Features` section (lines 273–305).

**Interfaces:**
- Consumes: `FEATURES`, `featuresByGroup`, `featureBlockers`, `type FeatureKey` from Task 1.
- Produces: nothing other tasks rely on.

Two hand-maintained lists collapse into loops. `featureWaiverRequired` is deliberately **not** added to this form — it stays on the waiver section with its text, which is the existing "one page owns one thing" split; the registry entry exists so the screen can *report* it.

- [ ] **Step 1: Replace the flag parsing in the save action**

In `app/admin/settings/page.tsx`, delete lines 46–50:

```ts
  const featureOnlineBooking = formData.get("featureOnlineBooking") === "on";
  const featureWalkInPortal = formData.get("featureWalkInPortal") === "on";
  const featureEmailNotify = formData.get("featureEmailNotify") === "on";
  const featureSmsNotify = formData.get("featureSmsNotify") === "on";
  const featureRewards = formData.get("featureRewards") === "on";
```

and put in their place:

```ts
  /*
   * The switches this form owns, read from the registry rather than named
   * five times. The waiver flag is declared in the registry too but lives on
   * the waiver section with its text, so it is not posted here and must not
   * be written from an absent checkbox.
   */
  const postedFlags = Object.fromEntries(
    FEATURES.filter((feature) => feature.key !== "featureWaiverRequired").map((feature) => [
      feature.key,
      formData.get(feature.key) === "on",
    ])
  ) as Record<Exclude<FeatureKey, "featureWaiverRequired">, boolean>;
```

- [ ] **Step 2: Spread the flags into the update**

Replace lines 96–100 in the `data` object:

```ts
      featureOnlineBooking,
      featureWalkInPortal,
      featureEmailNotify,
      featureSmsNotify,
      featureRewards,
```

with:

```ts
      ...postedFlags,
```

- [ ] **Step 3: Add the imports**

At the top of `app/admin/settings/page.tsx`:

```ts
import { FEATURES, featureBlockers, featuresByGroup, type FeatureKey } from "@/lib/features";
```

- [ ] **Step 4: Render the switch list from the registry**

Replace the five `<FeatureToggle>` elements (lines 275–304) with a loop over the grouped registry. The wrapping `<div className="-mt-2">` and the `<p>` note after it stay as they are:

```tsx
            {featuresByGroup()
              // The waiver is declared in the registry but owned by the waiver
              // section below, so its group renders nothing and must not leave
              // an empty div behind.
              .map(({ group, features }) => ({
                group,
                features: features.filter((feature) => feature.key !== "featureWaiverRequired"),
              }))
              .filter(({ features }) => features.length > 0)
              .map(({ group, features }) => (
                <div key={group}>
                  {features.map((feature) => (
                    <FeatureToggle
                      key={feature.key}
                      name={feature.key}
                      label={feature.label}
                      description={feature.blurb}
                      checked={config?.[feature.key] ?? false}
                      blockers={config ? featureBlockers(config, feature.key) : []}
                    />
                  ))}
                </div>
              ))}
```

- [ ] **Step 5: Teach `FeatureToggle` to report a blocker**

`FeatureToggle` is at line 162. Add `blockers` to its props and render them under the description. The switch itself stays enabled — a shop may turn SMS on before pasting credentials, and the Twilio fields are on an ADMIN-only screen a manager cannot open, so an unexplained dead switch would be a support call:

```tsx
function FeatureToggle({
  name,
  label,
  description,
  checked,
  blockers = [],
}: {
  name: string;
  label: string;
  description: string;
  checked: boolean;
  blockers?: string[];
}) {
```

and immediately after the existing description `<p>` (line 193–195), inside the same wrapping `<div>`:

```tsx
      {blockers.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
          Not live: {blockers.join(" ")}
        </p>
      )}
```

- [ ] **Step 6: Typecheck, lint and run the suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no tsc output, no eslint output, all tests passing.

- [ ] **Step 7: Check the screen by hand**

Run: `npm run dev` and open `http://localhost:3000/admin/settings`.
Expected: the Features section lists Online Booking, Walk-In Check-In Portal, Customer Rewards, Email Notifications, SMS Notifications — grouped in that order, switch positions unchanged from before. With no Twilio credentials saved and SMS switched on, the SMS row reads "Not live: Twilio credentials are missing — add them on the Notifications page." Toggle two switches, save, reload, and confirm both stuck.

- [ ] **Step 8: Commit**

```bash
git add app/admin/settings/page.tsx
git commit -m "$(cat <<'MSG'
refactor(settings): render the feature switches from the registry

The five switches and their five form reads were two hand-maintained
lists that had to agree with each other and with the column names. Both
are loops over FEATURES now, so adding a flag is a registry entry rather
than a form row somebody remembers.

A switch whose preconditions are unmet says what is missing instead of
claiming to be on. It stays togglable on purpose: the Twilio fields are
on an ADMIN-only screen a manager cannot open, so a dead switch with no
explanation would be a support call.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: Delete the dead settings route

**Files:**
- Delete: `app/api/admin/settings/route.ts`

**Interfaces:** none. Confirmed with the shop on 2026-09-14 that nothing outside the project calls it.

Why it goes rather than getting a registry-derived allowlist: nothing in the app calls it (the settings screen uses its own server action), its `PATCHABLE_FIELDS` has already drifted — missing all six threshold columns, carrying waiver fields the form never posts — and it defines a second local `requireManager(session)` shape nothing else in the codebase uses.

- [ ] **Step 1: Confirm there are still no callers**

Run:

```bash
grep -rn "api/admin/settings" app lib components --include="*.ts" --include="*.tsx" | grep -v "^app/api/admin/settings"
```

Expected: no output. If anything prints, stop and re-read it before deleting.

- [ ] **Step 2: Delete the route**

```bash
git rm app/api/admin/settings/route.ts
```

- [ ] **Step 3: Typecheck, lint, build and test**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean. `npm run build` is worth the wait here specifically — a deleted route is exactly the change that breaks Next's route type generation if something still references it.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'MSG'
refactor(settings): delete the unused settings PATCH route

Nothing calls it. The settings screen saves through its own server
action, and this route's PATCHABLE_FIELDS had drifted out of sync with
it — missing all six thresholds, carrying waiver fields the form never
posts. It also held a second requireManager(session) shape nothing else
in the codebase uses.

An admin-gated write endpoint with a stale allowlist and no consumer is
liability without benefit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Not a task: gating layer 2

The spec's second layer — a page that redirects itself when its feature is off —
needs no work. Every feature that has a page of its own already does it:
`app/portal/appointments/new/page.tsx:72` for online booking,
`app/api/walk-in/route.ts:30` for the walk-in portal, and `lib/rewards.ts` at
three call sites for rewards. Those 15 files keep reading the column directly,
per the Global Constraints. The layer exists; this change does not touch it.

---

### Task 5: Feature-gated nav entries

**Files:**
- Modify: `components/BackOfficeShell.tsx` — the nav item type used by `NavGroup` (line 85) and the arrays above it.

**Interfaces:**
- Consumes: `isEnabled`, `type FeatureKey` from Task 1. `config` is already loaded in the shell at line 111.
- Produces: an optional `feature?: FeatureKey` field on a nav entry.

**Judgement call, flagged for the reviewer:** none of the six existing flags governs a back-office nav entry, so this task has **no consumer today** — it is scaffolding for the planned clusters (a tickets screen, a recall list) that will have one. It is in the spec and therefore in the plan, but it is the one task that can be dropped without weakening the rest. If dropped, the first cluster that ships a gated nav item adds it, and the spec's layer 1 is unbuilt until then. Ask before implementing.

- [ ] **Step 1: Give a nav entry an optional feature key**

Replace the inline item type in `NavGroup` (line 85) with a named one declared above `NAV`:

```ts
/** A sidebar entry. `feature` hides the row when the shop has that feature off. */
interface NavItem {
  href: string;
  label: string;
  feature?: FeatureKey;
}
```

and change `NavGroup`'s signature to use it:

```tsx
function NavGroup({ label, items, first = false }: { label: string; items: NavItem[]; first?: boolean }) {
```

- [ ] **Step 2: Type the five arrays**

Annotate each existing array so a mistyped key is caught at the declaration rather than at the render: `const NAV: NavItem[] = [`, and the same for `MANAGE_NAV`, `INSIGHTS_NAV`, `SETTINGS_NAV`, `TECHNICAL_NAV`. No entries gain a `feature` yet.

- [ ] **Step 3: Filter on it where the shell builds its links**

In `BackOfficeShell`, after `config` is available (line 112), add:

```tsx
  /*
   * A feature that is off takes its nav rows with it. Presentation only — the
   * page behind each one redirects for itself, the same rule the admin links
   * follow.
   */
  const live = (items: NavItem[]) =>
    items.filter((item) => !item.feature || isEnabled(config, item.feature));
```

and wrap each `items={...}` passed to `NavGroup` in it, e.g.:

```tsx
        items={live(onFloor ? [...NAV.slice(0, 1), { href: "/staff/me", label: "My Shift" }, ...NAV.slice(1)] : NAV)}
```

- [ ] **Step 4: Add the import**

```ts
import { isEnabled, type FeatureKey } from "@/lib/features";
```

- [ ] **Step 5: Typecheck, lint, test**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all clean.

- [ ] **Step 6: Check the sidebar by hand**

Run `npm run dev`, sign in as the admin, and confirm every sidebar group still lists exactly what it listed before — this task must change nothing visible.

- [ ] **Step 7: Commit**

```bash
git add components/BackOfficeShell.tsx
git commit -m "$(cat <<'MSG'
feat(nav): let a sidebar entry name the feature it belongs to

A row whose feature is off is not shown. Presentation only — the page
behind it still redirects for itself, the same rule the admin links
follow. No entry uses it yet; the clusters that add a screen of their
own will.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: Correct the docs

**Files:**
- Modify: `CLAUDE.md` — the `SystemConfig — runtime feature flags` section.

**Interfaces:** none.

Two edits. The first is a correction: the section tells a reader that admin edits go through `app/api/admin/settings/route.ts` and that a new column must join `PATCHABLE_FIELDS` or the UI drops it. That route no longer exists after Task 4, and the claim was already wrong before it.

- [ ] **Step 1: Replace the stale paragraph**

Find this sentence in the `SystemConfig` section:

> Admin edits go through [app/api/admin/settings/route.ts](app/api/admin/settings/route.ts), which applies a `PATCHABLE_FIELDS` allowlist; add any new editable column to that set or the UI silently drops it.

and replace it with:

```markdown
Admin edits go through the `saveSettings` server action in
[app/admin/settings/page.tsx](app/admin/settings/page.tsx), which parses and
validates each field by hand — ordering the escalating thresholds, flooring the
reward divisor. A `PATCHABLE_FIELDS` allowlist on an API route used to sit
beside it, unused and drifting; it was deleted.

**Every switchable feature is declared once in [lib/features.ts](lib/features.ts).**
A feature key *is* its `SystemConfig` column name, so `config[key]` stays typed
and a typo is a compile error. The entry carries the label, the blurb, the
group, what "off" means for data already written (`accrues` | `silent` |
`frozen`), the flags it `requires`, and the configuration it `needs` — the last
returning *what* is missing, so the settings screen can say "Not live: Twilio
credentials are missing" rather than showing a dead switch. `isEnabled()` is
what a gate asks; `requireFeature()` in [lib/auth-guards.ts](lib/auth-guards.ts)
is what a mutation calls, because a server action is its own endpoint.

A flag is checked at four layers, and the fourth is the one that rots: the nav
row (presentation), the page (redirects itself), every mutation
(`requireFeature()`), and **the feature's section inside somebody else's page** —
the rewards card on a customer profile, gated where it renders. The first three
are about a route; that one is not, and no type catches it.

**Prefer emptiness to a flag.** A flag is for what a shop decides by policy —
rewards, SMS, the waiver, online booking. What varies by *size* needs no
setting: no kennel rows means no kennel UI, and every screen already skips an
empty station role. A solo groomer should not open Settings to fifteen switches
describing a shop they do not run.
```

- [ ] **Step 2: Check nothing else references the deleted route**

Run: `grep -rn "PATCHABLE_FIELDS\|api/admin/settings" CLAUDE.md DEPLOY.md docs/`
Expected: only matches inside `docs/superpowers/specs/2026-09-14-feature-registry-design.md` and `docs/superpowers/plans/2026-09-14-feature-registry.md`, which describe the deletion on purpose. Any hit in `CLAUDE.md` or `DEPLOY.md` needs the same correction.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'MSG'
docs: describe the feature registry, correct the settings edit path

CLAUDE.md sent a reader to an API route's PATCHABLE_FIELDS allowlist for
config edits. The real path is the saveSettings server action, the
allowlist was already drifting, and the route is gone.

Adds the registry: a key is a column name, what "off" means per feature,
the four layers a flag is checked at, and the rule that keeps the switch
list short — prefer emptiness to a flag, so what varies by shop size
needs no setting at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Done when

- `lib/features.ts` declares all six flags; `npx vitest run lib/features.test.ts` passes.
- `requireFeature()` sits beside `requireManager()` in `lib/auth-guards.ts`.
- `/admin/settings` renders its switches from the registry and reports a missing precondition.
- `app/api/admin/settings/route.ts` is gone and `npm run build` is clean.
- `CLAUDE.md` describes the registry and no longer points at `PATCHABLE_FIELDS`.
- `npx tsc --noEmit`, `npm run lint` and `npm test` are all clean, and a shop on defaults behaves exactly as it did before.
