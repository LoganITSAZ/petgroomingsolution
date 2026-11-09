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

## On a VPS

Any provider works; the commands assume Ubuntu. Give it **2 GB of RAM** — the
image is built on the box, and the build needs more memory than the running
shop does. On a 1 GB plan, add swap before the first build:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Install Docker, let your user run it, and clone the repo (sign out and back in
after the `usermod`):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
sudo git clone https://github.com/LoganITSAZ/petgroomingsolution.git /opt/gentlegroomer
sudo chown -R "$USER" /opt/gentlegroomer
```

Open only SSH and the web:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

Docker publishes ports around `ufw`, which is why Compose binds Postgres to
`127.0.0.1` — nothing but 80 and 443 faces the internet.

Turn on the provider's automatic backups too. That is the off-site copy of the
nightly dumps described under Backups, and it covers the box itself.

Updating later is `git pull` then `docker compose up -d --build` from
`/opt/gentlegroomer`, with a dump taken first — migrations only run forward, so
rolling back means the previous commit **and** the backup from before it. If
`git pull` refuses because of the domain edited into `nginx.tls.conf`,
`git stash && git pull && git stash pop` carries the edit across.

## First login

Use the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values from `.env`. The account is
created only when the database has no staff at all. **Change the password
immediately** — Admin → Staff. The seed runs on every deploy and is idempotent:
it never resurrects a removed account or resets an existing password.

Then open Admin → Shop Settings and pick the shop's **Time Zone**. A new shop
starts on `America/Phoenix`, and a VPS keeps its own clock on UTC, so this
setting is what decides the shop's day, its hours, the walk-in window and when
reminders go out. The field shows the shop's clock as it will read it.

## HTTPS

Do this before the first sign-in. With `NEXTAUTH_URL` on `https://`, the
session cookie is marked secure, and a browser will not keep it over plain
HTTP — signing in appears to work and lands back on the sign-in page.

The default `nginx.conf` serves plain HTTP so a fresh box works right away, and
it already answers Certbot's `/.well-known/acme-challenge/` requests. With the
domain's DNS pointing at this box and the stack up:

```bash
sudo apt install certbot
sudo certbot certonly --webroot -w /var/www/certbot \
  -d shop.example.com -d www.shop.example.com
sed -i 's/your-domain.example/shop.example.com/g' nginx.tls.conf
echo 'NGINX_CONF=./nginx.tls.conf' >> .env
docker compose up -d nginx
```

`nginx.tls.conf` redirects HTTP to HTTPS and terminates TLS. Leave the `www.`
names out of both the certbot line and the file if the domain has no `www`
record.

Certbot renews on its own timer, but nginx keeps serving the certificate it
loaded until it is told to reload — without this hook the site's certificate
expires three months after it was issued:

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/sh
docker exec gentlegroomer_nginx nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run
```

Both nginx configs throttle sign-in, registration and password-reset posts to
about ten a minute per address. Ordinary pages and the station streams are not
counted.

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

Everything — photos and signatures included — lives in the `postgres_data`
volume, so one dump is the whole shop. Nightly at 3am, kept for 30 days, from
the host's crontab (`crontab -e`; use the path the repo is cloned to):

```
0 3 * * * cd /opt/gentlegroomer && mkdir -p backups && docker compose exec -T db pg_dump -U postgres gentlegroomer | gzip > backups/$(date +\%F).sql.gz && find backups -name '*.sql.gz' -mtime +30 -delete
```

A backup on the same disk does not survive the disk. Copy `backups/` off the
box as well — another machine, or cloud storage with `rclone`.

Restoring replaces the database, so stop what writes to it first:

```bash
docker compose stop app jobs
docker compose exec -T db dropdb -U postgres gentlegroomer
docker compose exec -T db createdb -U postgres gentlegroomer
gunzip -c backups/2026-08-23.sql.gz | docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 gentlegroomer
docker compose start app jobs
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
