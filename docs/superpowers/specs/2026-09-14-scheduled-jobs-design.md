# Scheduled jobs, and the first one: appointment reminders

**Date:** 2026-09-14
**Status:** approved design, not yet implemented

## Why

The app has no way to do anything at a time nobody is looking at a screen. Every
side effect today hangs off a request — a status change, a form save, a page
render. Four things the shop wants are time-based rather than request-based:

1. Remind a customer the day before their visit. The shop already measures
   no-shows in `lib/insights.ts` and can do nothing about them.
2. Nudge when a pet's vaccination confirmation has gone stale.
3. Follow up a no-show.
4. Prompt a rebooking against `customerRhythm()`.

This builds the runner those need, with (1) on it. (2)–(4) are out of scope and
become one function each afterwards.

## Decisions taken

| Question | Decision |
|---|---|
| Runner or one-off feature? | A registry with one job on it. |
| How is it triggered? | A Compose sidecar, plus a CLI for running by hand. |
| How is "sent once" guaranteed? | A `NotificationLog` row, unique per visit per kind. |
| Is the reminder a shop setting? | Yes — flag and hours on `SystemConfig`. |
| Send then log, or log then send? | Log first. See "Claim before send". |

## Architecture

```
lib/jobs/types.ts       ScheduledJob, JobResult
lib/jobs/schedule.ts    dueJobs(now, lastRuns) — pure
lib/jobs/reminders.ts   remindUpcomingVisits
lib/jobs/index.ts       JOBS: ScheduledJob[]
scripts/jobs.ts         CLI: `once [name]` | `loop`
```

A job is a name, a cadence and a function:

```ts
interface ScheduledJob {
  name: string;
  everyMins: number;
  run(now: Date): Promise<JobResult>;
}

type JobResult =
  | { status: "skipped"; reason: string }
  | { status: "ran"; acted: number; detail?: string };
```

`run()` takes `now` rather than reading the clock, so a test can place it
anywhere without mocking a module.

### The loop

`scripts/jobs.ts loop` wakes every 60 seconds and runs whatever `dueJobs()`
says is owed, sequentially. Last-run times live in memory.

That memory is deliberate: **on start, every job is due.** A redeploy or an
outage therefore heals itself on the next boot rather than leaving a hole, and
there is no run-state table to keep correct. The cost is that a runner
restarting in a tight crash loop re-runs jobs each time — bounded by each job's
own idempotency, which is the `NotificationLog` constraint for this one.

A job that throws is logged and skipped. It never ends the loop or affects a
sibling.

### The sidecar

A new Compose service off the existing `toolbox` target:

```yaml
jobs:
  build: { context: ., target: toolbox }
  container_name: gentlegroomer_jobs
  restart: unless-stopped
  command: ["npx", "tsx", "scripts/jobs.ts", "loop"]
  environment:
    DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/gentlegroomer
    RESEND_API_KEY: ${RESEND_API_KEY:-}
    EMAIL_FROM: ${EMAIL_FROM:-}
  depends_on:
    db: { condition: service_healthy }
    migrate: { condition: service_completed_successfully }
  networks: [internal]
```

The toolbox stage currently copies `prisma` and `lib` only; it needs
`COPY scripts ./scripts` as well.

Twilio credentials are not environment variables — they live on `SystemConfig`
and `lib/sms.ts` reads them per send, so the sidecar picks them up from the
database like the app does.

**The sidecar is a second process, not a second app instance.** It serves no
requests and cannot reach the in-process SSE subscriber map in
`lib/station-events.ts`. Reminders do not need to. Any future job that must
repaint a kiosk has to go through the app rather than the runner.

Two npm scripts are added: `jobs:once` (`tsx scripts/jobs.ts once`) and
`jobs:loop`. `npm run jobs:once reminders` runs one job through the same code
path, for testing and for a shop that prefers host cron to the sidecar.

## Data model

```prisma
model NotificationLog {
  id            String           @id @default(cuid())
  appointmentId String
  customerId    String
  kind          NotificationKind
  channels      String[]         // "EMAIL", "SMS" — which ones actually went
  sentAt        DateTime         @default(now())

  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  customer    Customer    @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@unique([appointmentId, kind])
  @@index([customerId, sentAt])
  @@map("notification_logs")
}

enum NotificationKind {
  APPOINTMENT_REMINDER
}
```

One row per kind per visit, not one per channel. The question it answers is
"have we reminded them", and the channels are a record of what happened rather
than part of the key.

`appointmentId` is **required**. Postgres does not treat two NULLs as equal in a
unique index — the same trap `Service.@@unique` already carries a comment about
— so a nullable column would give a constraint that silently stops working for
any future kind that is not about one visit. Such a kind needs its own
uniqueness decision, not an inherited one that does not hold.

The `customerId` index is there for the counter question nothing in the app can
answer today: what have we sent this person?

### Shop settings

```prisma
featureAppointmentReminders Boolean @default(true)
reminderHoursBefore         Int     @default(24)
```

Edited on `/admin/settings` with the other thresholds. A shop that does not want
reminders turns them off without losing pickup notifications.

**Documentation correction:** CLAUDE.md says admin settings go through
`app/api/admin/settings/route.ts` behind a `PATCHABLE_FIELDS` allowlist. Neither
exists any more — `/admin/settings` saves through a server action in its own
page. Fix that paragraph as part of this work.

## The reminder job

Registered at `everyMins: 15`. The window is hours wide, so a quarter-hour
cadence is well inside it; the only thing a tighter loop would buy is a
marginally earlier send.

`remindUpcomingVisits(now)`:

1. Read config. If `featureAppointmentReminders` is false, return
   `{ status: "skipped" }` without querying.
2. Select `SCHEDULED` visits with `scheduledAt` in `(now, now + reminderHoursBefore]`
   and no `NotificationLog` row for `APPOINTMENT_REMINDER`. The status filter
   alone excludes cancelled, no-show, and pets already in the shop.
3. Drop any visit closer than `bookingLeadHours` (default 2). Late is fine — the
   runner may have been down and the customer still wants to know. An hour
   before is noise.
4. For each: write the log row, then send.
5. Return how many were reminded.

Channels follow the existing rules exactly: email when `featureEmailNotify` and
the customer has an address; SMS when `featureSmsNotify`, the number parses to
E.164, and `smsOptOut` is false. Both sends are non-fatal — a carrier outage
must not stop the rest of the batch, the same rule every other send in the app
follows.

Copy lives beside its siblings: `sendAppointmentReminder()` in `lib/email.ts`,
`smsAppointmentReminder()` in `lib/sms.ts`. Dates render through
`formatShopDate` / `formatShopTime`, never the server's zone.

### Claim before send

The log row is written **before** the messages go.

A crash between the two loses one reminder. The other ordering sends it twice.
A missed reminder is invisible to the customer; a duplicate text at seven in the
morning is what a shop gets a phone call about. The code carries a `ponytail:`
comment naming the ceiling, so the trade is visible to whoever reads it next.

The unique constraint is the real guard rather than the single-runner
assumption: two runners racing produce one winner and one `P2002`, which is
caught and treated as "already sent" rather than an error.

## Visibility

`docker compose logs -f jobs` shows every run — a line per job per wake, with
its result.

The `/admin` system-status page gains one line: when the last reminder went out,
read as `max(sentAt)` from `NotificationLog`. Enough for the shop to see the
thing is alive. A proper jobs screen — last run, last result, next due, re-run —
is deliberately deferred until there is more than one job to look at.

DEPLOY.md gains a short section: what the service is, how to read its logs, and
how to run a job by hand.

## Testing

Pure halves, the same shape as `lib/kennels.ts`:

- `lib/jobs/schedule.test.ts` — `dueJobs(now, lastRuns)`: nothing run yet means
  everything is due; a job inside its cadence is not; a job past it is.
- `lib/jobs/reminders.test.ts` — `selectVisitsToRemind(visits, config, now)`:
  both window edges, the lead-hours floor, an already-logged visit, a visit in
  the wrong status. `vi.setSystemTime()` on the boundaries, per the repo's
  existing habit with `SHOP_TIMEZONE`.

The loop itself, the CLI and the Compose service get no tests — they are
wiring, and the logic they wire is covered above.

## Out of scope

- An admin screen for jobs, and a `JobRun` history table to back it. Deferred
  until a second job exists; a table nobody reads is not worth keeping correct.
- The other three time-based jobs named at the top.
- Inbound SMS. Unrelated, and still blocked on the same public callback URL and
  signature verification noted in the consent work.
