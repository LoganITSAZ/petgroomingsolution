# Feature registry (modularity substrate)

## Problem

Six feature flags live on `SystemConfig` as boolean columns. Each one is
hand-wired in four places: the column, a `PATCHABLE_FIELDS` entry, a row in
the `/admin/settings` form, and every gate that reads it. That survives at six
flags and rots past a dozen — and a dozen is where this app is heading, because
every planned feature has to be switchable so the same install serves a solo
groomer and a six-table shop.

Two concrete symptoms of the rot are already in the tree:

- **`app/api/admin/settings/route.ts` is dead.** Nothing in the app calls it.
  The settings screen saves through its own server action
  (`app/admin/settings/page.tsx:29`), which writes 25 fields by hand. The
  route's `PATCHABLE_FIELDS` allowlist has drifted out of sync with it — it is
  missing all six threshold columns and carries waiver fields the form never
  posts. CLAUDE.md documents that allowlist as the path admin edits take, which
  is no longer true.
- **Preconditions are comments.** `schema.prisma` says SMS "requires Twilio
  config" and that null `waiverText` means "feature off even if the flag is
  true". Neither is enforced anywhere. A shop can switch SMS on with no
  credentials and get silence with no explanation.

## Decisions from discussion

- **Registry over the existing columns**, not a `Feature` table and not a JSON
  blob. A migration per new flag is a feature, not a cost: a new toggle should
  appear in a migration and in the type. Approaches rejected:
  - *Normalized `Feature { key, enabled }` table* — adding a flag needs no
    migration, but `config.featureRewards` becomes an untyped lookup, all 15
    existing read sites change, and rows drift from the code registry in both
    directions (a key with no row, a row with no key).
  - *Single `features Json` column* — no migration, no type safety, no per-key
    DB default. `businessHours` is already the awkward part of this config.
- **Feature keys are the column names.** `config[key]` then typechecks against
  the Prisma type, every existing `config.featureRewards` read stays untouched,
  and a typo is a compile error rather than a silently-false flag.
- **Prefer emptiness to a flag.** A flag is only for what a shop decides by
  *policy* (rewards, SMS, waiver, online booking, and later deposits and
  ticketing). What varies by *size* needs no flag: no kennel rows means no
  kennel UI, and the screens already skip an empty station role. Otherwise a
  solo groomer opens Settings to fifteen switches describing a shop they do not
  run.
- **Delete the dead route** rather than fix its allowlist. See Open questions.
- **No migration, no new column, no behaviour change** for a shop on defaults.
  This is a substrate change.

## The registry

`lib/features.ts` — pure. No Prisma import; it takes the config object as an
argument, the same shape as `compartmentRoom()` taking numbers. Testable in
`lib/features.test.ts`.

```ts
export type FeatureKey =
  | "featureOnlineBooking"
  | "featureWalkInPortal"
  | "featureEmailNotify"
  | "featureSmsNotify"
  | "featureWaiverRequired"
  | "featureRewards";

export type FeatureGroup = "Customers" | "Notifications" | "Compliance";

export interface Feature {
  key: FeatureKey;
  /** The same words as the screen it governs — one screen, one name. */
  label: string;
  /** One line: what turning it off does to the shop. */
  blurb: string;
  group: FeatureGroup;
  offMeans: "accrues" | "silent" | "frozen";
  /** Other flags that must be on first. */
  requires?: FeatureKey[];
  /** Configuration the feature cannot work without, named rather than guessed. */
  needs?: (config: FeatureConfig) => string | null;
}

export const FEATURES: Feature[];

/** Flag on, `requires` satisfied, and nothing in `needs` missing. */
export function isEnabled(config: FeatureConfig, key: FeatureKey): boolean;

/** Why a feature is not live, for the settings screen. Empty when it is. */
export function featureBlockers(config: FeatureConfig, key: FeatureKey): string[];

/** Which other features go off with this one, for the save confirmation. */
export function dependents(key: FeatureKey): FeatureKey[];
```

Groups exist to keep the switch list scannable, and each of the six has one:

| Feature | Group | `offMeans` |
|---|---|---|
| `featureOnlineBooking` | Customers | `silent` |
| `featureWalkInPortal` | Customers | `silent` |
| `featureRewards` | Customers | `accrues` |
| `featureEmailNotify` | Notifications | `silent` |
| `featureSmsNotify` | Notifications | `silent` |
| `featureWaiverRequired` | Compliance | `frozen` |

`FeatureConfig` is a structural subset of `SystemConfig` — the flag columns
plus the fields `needs` reads (`twilioAccountSid`, `twilioAuthToken`,
`twilioFromNumber`, `waiverText`) — so the module stays free of a Prisma
import and a test can pass a literal.

`needs` returning a *string* rather than a boolean is the point: the settings
screen says "Not live: Twilio credentials missing" rather than showing a dead
switch with no explanation.

## What "off" means

Declared per feature, so no screen re-decides it:

| `offMeans` | Behaviour |
|---|---|
| `accrues` | Rows keep being written; only the display is gated. Turning it on has history behind it. `featureRewards` already works this way by design — punches accrue while off. |
| `silent` | Emits nothing, and there was nothing to accrue. |
| `frozen` | What is written stays readable; new writes stop; nothing is deleted. `featureWaiverRequired` is this: signed `WaiverAcceptance` rows are a legal record and stay on file. |

Which feature is which is in the table above.

`featureWaiverRequired` can never be `accrues`: a waiver nobody was shown
cannot be retroactively signed.

## Dependencies vs preconditions

Two mechanisms, deliberately separate.

**`requires`** names another flag. Switching a parent off reports what else
goes off and does it in the same save, so no orphan switch is left on
describing a feature that cannot run. Nothing uses it in cluster 0 — the six
existing flags are independent — but the planned money cluster needs it
(deposits require ticketing), and shipping the mechanism with the registry
avoids retrofitting it later.

**`needs`** names configuration, not a flag. SMS needs three Twilio fields.
The switch stays togglable, because a shop may turn it on before pasting
credentials; `isEnabled()` returns false and Settings reports what is missing.

Why not grey the switch out when `needs` fails: the Twilio fields live on
`/admin/notifications`, which is ADMIN-only, and a MANAGER cannot see that
screen at all. A manager flipping SMS on and being told what is missing is
useful; a disabled switch with no reachable explanation is a support call.

## Where a flag is checked

Same rule this codebase already applies to admin access: hiding a link is
presentation, so access is gated again underneath.

1. **Nav.** `NAV` / `MANAGE_NAV` entries in `components/BackOfficeShell.tsx`
   gain an optional `feature?: FeatureKey`. The shell already loads the config
   (`BackOfficeShell.tsx:111`), so it filters there. Presentation only.
2. **Page.** The page redirects itself, the way `/staff/analytics` redirects a
   non-manager — to the parent list screen, not a 404. The URL is valid; the
   feature is off.
3. **Mutation.** `requireFeature(key)` in `lib/auth-guards.ts`, matching
   `requireManager()`'s shape (throws, no session argument). Every server
   action and API route calls it, because a server action is its own endpoint
   and no layout check runs for it.
4. **Embedded surface.** The part of *another* page that belongs to the
   feature — the rewards card on a customer's profile today, a photo strip on
   the station job aid later — gated where it renders.

Layer 4 is the one that rots, because the first three are all about a route
and this one is not. No type catches it; it is named here and in the registry
doc comment so a reviewer has something to check against.

## Files

| File | Change |
|---|---|
| `lib/features.ts` | New. The registry and its three functions. |
| `lib/features.test.ts` | New. Pure tests, below. |
| `lib/auth-guards.ts` | Add `requireFeature(key)`. |
| `app/admin/settings/page.tsx` | Render the switch list from `FEATURES`; loop the flag block in the save action. Threshold parsing unchanged. |
| `components/BackOfficeShell.tsx` | Optional `feature` on nav entries; filter on it. |
| `app/api/admin/settings/route.ts` | Delete (both verbs). |
| `CLAUDE.md` | Correct the `PATCHABLE_FIELDS` paragraph; add the emptiness-over-a-flag rule. |

The `/admin/settings` threshold inputs stay exactly as they are — they are
numbers a feature runs on, not features. The save action keeps its explicit
field-by-field parsing, because ordering and flooring the thresholds is real
validation rather than boilerplate; only the flag block becomes a loop.

The 15 files that read a flag column today are **not** touched. `config.featureRewards`
stays valid. Migrating them to `isEnabled()` happens where a feature gains a
`needs` or a `requires` that makes the bare column wrong — SMS and the waiver
are the two, and both are in scope only insofar as `isEnabled()` is what the
settings screen reports.

## Testing

`lib/features.test.ts`, all pure:

- **Registry integrity.** Every `FeatureKey` in the union is declared exactly
  once in `FEATURES`, and every `requires` entry names a declared key. This is
  the cheap test that buys what the rejected `Feature` table was trying to buy.
- **`needs`.** Column true, Twilio credentials absent: `isEnabled()` false and
  `featureBlockers()` names the credentials. Same for `featureWaiverRequired`
  with null `waiverText`.
- **`requires`.** A fixture parent/child pair: child on and parent off resolves
  to disabled, and `dependents(parent)` returns the child.
- **No false negatives.** A fully configured default config reports every
  flag's `isEnabled()` equal to its column.

`npm test` and `npx tsc --noEmit` stay green; `next lint` covers the new test
file, so no unused imports in it.

## Out of scope

- No new flags. Cluster 0 adds the mechanism and adopts the six that exist.
- No changes to what any existing feature does when off. The `offMeans` column
  documents current behaviour; it does not change it.
- Per-feature settings blocks (the reward label, the booking window) stay where
  they are on the settings screen. The registry describes switches, not the
  numbers a feature runs on.

## Open questions

1. **Does anything outside the app call `/api/admin/settings`?** A script, a
   curl one-liner, something on the Pi would not appear in a grep. Default is
   to delete. If it is in use, keep the route and derive `PATCHABLE_FIELDS`
   from `FEATURES` plus an explicit non-feature list — a two-line change rather
   than a deletion.

## Why this is cluster 0

Six feature clusters follow it, in dependency order: the visit photo record,
the clip spec, intake condition and shave-down authorization, the vaccination
gate, rebooking cadence, and money at the counter. Each needs a switch. Built
without this, each one hand-wires its own flag four times and re-argues what
"off" means; built with it, a cluster declares one registry entry and picks a
word.
