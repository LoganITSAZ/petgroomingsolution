# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Gentle Groomer — pet grooming shop management app (gentlegroomer.net). Next.js 14 App Router + TypeScript (strict) + Tailwind + Prisma/PostgreSQL + NextAuth v5 (beta). Self-hosted via Docker Compose behind Nginx.

## Commands

```bash
npm run dev              # dev server (localhost:3000)
npm run build            # next build (output: "standalone")
npm run lint             # next lint
npm run db:generate      # prisma generate — rerun after ANY schema.prisma edit
npm run db:migrate:dev   # create + apply migration (dev)
npm run db:migrate       # prisma migrate deploy (prod)
npm run db:seed          # seed SystemConfig + admin + 4 stations
npm run db:studio        # Prisma Studio
npx tsc --noEmit         # typecheck (clean; keep it that way)
```

No test framework is set up. No test script exists — do not invent one.

`tsconfig.json` has `incremental: true`. If `tsc --noEmit` reports errors that contradict the current config (notably TS2802 on `Set` iteration), delete the stale `tsconfig.tsbuildinfo` and rerun.

Local dev expects Postgres on `localhost:5432` (`.env.local`). Docker Compose exposes port 5432, so `docker compose up db` is enough for local work; the full stack (`app` + `db` + `nginx`) targets production and uses host `db:5432`.

Seed creates `admin@gentlegroomer.net` / `changeme123`.

## Architecture

### Three audiences, three route trees

| Prefix | Who | Auth |
|---|---|---|
| `/`, `/(public)` | anyone | none |
| `/portal/*` | customers | session with `userType === "customer"` |
| `/staff/*` | staff | `userType === "staff"` |
| `/admin/*` | admins | `userType === "staff" && role === "ADMIN"` |
| `/station/[id]` | shop kiosk (Raspberry Pi touchscreen) | **none — deliberately unauthenticated** |

[middleware.ts](middleware.ts) enforces the first four via `matcher`. `/station/*` is intentionally absent from the matcher: the Pi screens have no login. Any new station-facing route inherits that exposure — treat it as public.

### Auth model — two user tables, one provider, split across two runtimes

[lib/auth.ts](lib/auth.ts) uses a single NextAuth Credentials provider whose `role` credential (`"customer" | "staff"`) selects which table to check (`Customer` vs `Staff`, both bcrypt `passwordHash`). JWT strategy; there is no adapter, because credentials + JWT never touches one and the schema has no `User`/`Account`/`Session` tables.

The config is deliberately split in two:

- [lib/auth.config.ts](lib/auth.config.ts) — edge-safe. Session strategy, pages, and the JWT/session callbacks that attach `id`, `role` (`ADMIN` | `GROOMER` | `CUSTOMER`), and `userType`. Also holds the `Session` type augmentation. **No Prisma, no bcrypt.**
- [lib/auth.ts](lib/auth.ts) — Node-only. Spreads `authConfig` and adds the Credentials provider with its database lookups.

[middleware.ts](middleware.ts) runs on the Edge runtime, so it builds its own `NextAuth(authConfig)` instance. Importing `lib/auth` there would pull Prisma and bcrypt into the edge bundle. Keep that boundary.

API routes re-check authorization themselves with `await auth()` — middleware does not cover `/api/*`.

### SystemConfig — runtime feature flags

Single row, `id = "global"`. `getConfig()` in [lib/config.ts](lib/config.ts) upserts it on first read, so it always exists. It holds shop identity, feature flags (`featureOnlineBooking`, `featureWalkInPortal`, `featureEmailNotify`, `featureSmsNotify`, `featureWaiverRequired`), waiver text/version, business hours JSON, and booking/walk-in windows.

Flags are checked at request time, not build time — new behavior that should be toggleable belongs here, not in an env var. Admin edits go through [app/api/admin/settings/route.ts](app/api/admin/settings/route.ts), which applies a `PATCHABLE_FIELDS` allowlist; add any new editable column to that set or the UI silently drops it.

### Station displays — SSE with an in-process subscriber map

[lib/station-events.ts](lib/station-events.ts) owns `subscribers: Map<stationId, Set<controller>>` at module scope and exports `subscribeToStation()` / `broadcastToStation()`. [app/api/station/[id]/events/route.ts](app/api/station/[id]/events/route.ts) streams from it; [app/api/appointments/[id]/status/route.ts](app/api/appointments/[id]/status/route.ts) broadcasts after every status change. The kiosk page reconnects on error every 3s.

Consequences to respect:
- Only works with a **single app instance**. Scaling out or moving to serverless breaks live updates and needs a real pub/sub layer.
- Nginx must not buffer `/api/station/` — [nginx.conf](nginx.conf) sets `proxy_buffering off`, and the route sets `X-Accel-Buffering: no`. Keep both.
- The registry lives in `lib/` rather than the route file because Next only allows route-handler exports from a `route.ts`; exporting a helper from there fails `next build`.

### Appointment lifecycle

`AppointmentStatus` enum (schema.prisma) is the source of truth. The kiosk's linear advance path is a subset, hardcoded as `STATUS_FLOW` in [app/station/[id]/page.tsx](app/station/[id]/page.tsx#L38): `CHECKED_IN → IN_PROGRESS → DRYING → FINISHING → COMPLETE → READY_PICKUP → PICKED_UP`. Adding a mid-groom status means editing both the enum and that array.

Every status change writes an `AppointmentStatusHistory` row (audit trail). `READY_PICKUP` triggers `sendReadyForPickup()`, wrapped in `.catch(console.error)` so email failures never fail the request — keep notification sends non-fatal.

Walk-ins (`appointmentType: WALK_IN`) are created already `CHECKED_IN` via [app/api/walk-in/route.ts](app/api/walk-in/route.ts).

### Domain detail worth knowing

`VisitEvent` records mid-groom incidents (`REWASH`, `BITE`, `INJURY`, …). A `BITE` event is meant to set `Pet.hasBiteHistory`, which the kiosk renders as a full-width red `⚠ BITE HISTORY` banner (`.bite-warning`, [app/globals.css](app/globals.css#L17)). Safety-signal UI on the station screen is functional, not decorative.

### Rendering mode

`SystemConfig` is edited at runtime, so any page that reads it must not be prerendered — a static snapshot freezes shop details, feature flags, and waiver text until the next deploy. [app/(public)/layout.tsx](app/(public)/layout.tsx) and [app/(auth)/register/page.tsx](app/(auth)/register/page.tsx) set `export const dynamic = "force-dynamic"` for exactly this reason. Add the same export to any new config-reading page that would otherwise be static.

Anything reading `useSearchParams()` needs a `<Suspense>` boundary above it or `next build` fails while prerendering — see `/login` and `/register`.

## Conventions

- Import alias `@/*` → repo root (e.g. `@/lib/prisma`).
- Prisma models are `PascalCase` with explicit `@@map` to snake_case tables. Keep that pattern.
- Validation is inconsistent across API routes: some use zod (`status`, auth), others hand-check with `Object.values(Enum).includes(...)`. Prefer zod for new routes.
- Enum → display string goes through `formatStatus` / `formatServiceType` / `formatSpecies` / `formatCoatType` in [lib/utils.ts](lib/utils.ts). Don't re-implement inline.
- Tailwind `brand-*` is a custom amber ramp in [tailwind.config.ts](tailwind.config.ts). Station UI is deliberately oversized (`text-4xl`+, big touch targets) for a Pi screen at arm's length.
- `components/ui/` holds the small shared primitives (Badge, Button, Card, Input) re-exported from `index.ts`.

## Traps

- **All wall-clock comparisons go through `SHOP_TIMEZONE`.** [lib/utils.ts](lib/utils.ts) exports `SHOP_TIMEZONE` (`America/Phoenix`), `currentShopTime()`, and `isWithinWalkInWindow(start, end, now?)`. The server may run in UTC and the browser in the viewer's zone, so never compare `walkInWindowStart`/`End` against `getHours()` or `getUTCHours()` directly. Window is `[start, end)` — end exclusive.
- **Never construct an API client at module scope from an env var.** Next evaluates route modules during `next build`, so a throwing constructor breaks the build wherever the key is unset (CI, the Docker image build). [lib/email.ts](lib/email.ts) lazily builds the Resend client and no-ops when `RESEND_API_KEY` is absent — follow that shape.
- Route handlers use the Next 14 signature `{ params }: { params: { id: string } }`, not the Next 15 `Promise<...>` form. Mixing them breaks the build's route type check.
- The seed command lives in the `prisma.seed` key of [package.json](package.json). (A `prisma.config.ts` used to sit alongside it; it was removed because `prisma/config` does not exist in Prisma 5.x.)
