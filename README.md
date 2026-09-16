# Gentle Groomer

Shop management for a pet grooming business — booking, the floor, the kennels,
the schedule and the numbers, in one self-hosted app.

It is built for a single shop that runs its own box. There is no tenancy, no
billing, and no third-party service to sign up for: Postgres holds everything
including the photos, maps come from OpenStreetMap without an API key, and the
only optional credentials are an email sender and Twilio.

## What it does

**Customers** book online, keep their pets' profiles, sign the waiver and see
their history at `/portal`.

**Staff** work the floor at `/staff` — today's appointments, check-in, the
station a pet is on, kennel assignment, presence, the schedule, and analytics with
a groomer leaderboard. It is responsive, because groomers work from their
phones.

**Admins and shop managers** run the shop at `/admin` — services and prices,
promotions, legacy customer rates, the schedule, staff, stations and kennels,
the waiver, notifications, the public site's theme, and downloadable reports.

**The shop's touchscreens** show `/station/[id]` — a kiosk view of the pet on
that table, or a whole kennel board, updated over server-sent events. It is
deliberately unauthenticated, and it faces the lobby, so no customer address
ever appears on it.

## Stack

Next.js 14 (App Router) · TypeScript strict · Tailwind · Prisma + PostgreSQL ·
NextAuth v5 (credentials + JWT) · Vitest. Docker Compose behind Nginx for
deployment.

## Local development

Postgres on `localhost:5432` is all you need; Compose exposes it.

```bash
docker compose up db          # or your own Postgres
cp .env.example .env.local    # set DATABASE_URL and AUTH_SECRET
npm install
npm run db:migrate:dev
npm run db:seed               # SystemConfig + admin + 4 stations
npm run dev                   # localhost:3000
```

Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your env file.

| Command | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build (`output: "standalone"`) |
| `npm run lint` | `next lint` — runs over test files too |
| `npm test` | Vitest |
| `npx tsc --noEmit` | typecheck |
| `npm run db:generate` | rerun after **any** `schema.prisma` edit |
| `npm run db:migrate:dev` | create + apply a migration |
| `npm run db:studio` | Prisma Studio |

Tests cover the pure arithmetic — money, price tiers, kennel room, schedule
hours, reports and the shop's timezone boundaries — which is the part of this
codebase easiest to get subtly wrong. Keep `npm test` and `tsc --noEmit` green.

## Layout

```
app/(public)     public site — home, services and pricing, about, contact
app/portal       customers
app/staff        the floor
app/admin        running the shop
app/station      unauthenticated kiosk screens
app/api          route handlers (they re-check auth themselves)
lib              the domain: pricing, kennels, schedule, insights, rewards…
components/ui    PageShell and the small shared primitives
prisma           schema, migrations, seed
```

Business rules live in `lib/` as plain functions over rows, not in components,
which is why they are testable and why every screen agrees with every other
one. Figures are derived when they are read — there are no metrics tables, no
rewards balance column, no stored occupancy on a kennel door.

## Configuration

Shop identity, feature flags and the shop's own thresholds live in the
`SystemConfig` row and are edited at `/admin/settings` — not in environment
variables, so they can change without a deploy. Environment variables cover
only what must exist before the database does: the connection string, the auth
secret, the first admin, and the optional email/SMS credentials. See
[.env.example](.env.example).

## Deploying

`docker compose up -d --build` builds, migrates, seeds and starts. Full
instructions, including TLS and backups, are in [DEPLOY.md](DEPLOY.md).

## Working on it

[CLAUDE.md](CLAUDE.md) is the architecture guide — the auth model, the station
event stream, how pricing and kennels and the schedule actually work, and the traps
(timezones, status changes, the jQuery-owned form rows). Read it before
changing anything in `lib/`.

[ROADMAP.md](ROADMAP.md) is what the shop has asked for next, and what is
already built of it.
