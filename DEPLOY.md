# Deploying the Pet Grooming App

One command, on any box with Docker installed.

```bash
cp .env.example .env      # then set POSTGRES_PASSWORD and AUTH_SECRET
docker compose up -d --build
```

Set the shop identity and first admin credentials in `.env` before the first
deploy. Existing shop settings are stored in the database and are not
overwritten by later deploys.

That builds the app, starts Postgres, **applies every migration, seeds the
baseline data, and only then starts the site** on port 80.

Generate a session key with:

```bash
openssl rand -base64 32
```

Compose refuses to start if `POSTGRES_PASSWORD` or `AUTH_SECRET` is missing, so
a half-configured deploy fails immediately instead of silently.

## First login

Use the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values from `.env`. The account is
created only when the database has no staff at all. **Change the password
immediately** — Admin → Staff. The seed runs on every deploy and is idempotent:
it never resurrects a removed account or resets an existing password.

## HTTPS

The default `nginx.conf` serves plain HTTP so a fresh box works right away, and
it already answers Certbot's `/.well-known/acme-challenge/` requests.

Once certificates exist in `/etc/letsencrypt/live/<domain>/`:

```bash
echo 'NGINX_CONF=./nginx.tls.conf' >> .env
docker compose up -d nginx
```

`nginx.tls.conf` redirects HTTP to HTTPS and terminates TLS. Edit the
the `server_name` and certificate paths in it for your domain.

## Day to day

```bash
docker compose logs -f app        # application logs
docker compose ps                 # health of each container
docker compose up -d --build      # deploy a new version (migrations included)
docker compose down               # stop everything; data survives in a volume
```

`GET /api/health` returns `{ ok, dbLatencyMs }` and backs the container
healthcheck.

## Scheduled jobs

The `jobs` container is a second process beside the app. It wakes every minute
and runs whatever is owed: appointment reminders, sent `reminderHoursBefore`
before a visit, and the rebooking nudge for households past their own usual gap
between grooms (both in Shop Settings, both on by default). It serves
no requests, so it is not a second app instance and does not affect live
station updates.

```bash
docker compose logs -f jobs                            # a line per job per wake
docker compose exec jobs npx tsx scripts/jobs.ts once   # run everything now
docker compose exec jobs npx tsx scripts/jobs.ts once reminders  # one job
```

Nothing is lost if the container is down for a while: last-run times live in
memory, so every job is due again on start and the reminder window is hours
wide. Sending twice is what is guarded against — a `notification_logs` row is
claimed before the messages go.

Reminders go out over whatever the shop has live: email needs
`RESEND_API_KEY`, SMS reads its Twilio credentials from the database like the
app does. A shop that prefers host cron to the container can drop the service
and run `npm run jobs:once` on a schedule instead.

## Backups

Everything lives in the `postgres_data` volume.

```bash
docker compose exec db pg_dump -U postgres gentlegroomer > backup-$(date +%F).sql
cat backup-2026-08-23.sql | docker compose exec -T db psql -U postgres gentlegroomer
```

## Notes

- Postgres is published on `127.0.0.1:5432` only — reachable from the host for
  psql or Prisma Studio, not from the network.
- Station displays stream server-sent events. Nginx must not buffer
  `/api/station/`; both configs already set `proxy_buffering off`.
- Live station updates are held in the app process, so run **one** app
  container. Scaling out needs a shared pub/sub layer first.
- `SEED_ON_START=false` skips the seed if you would rather manage catalog data
  entirely by hand.
