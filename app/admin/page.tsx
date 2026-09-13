import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { stationSubscriberCounts } from "@/lib/station-events";
import { formatShopDate, formatShopTime, SHOP_TIMEZONE } from "@/lib/utils";
import pkg from "@/package.json";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import { currentStaffIsAdmin } from "@/lib/staff-roles";
import { redirect } from "next/navigation";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "System Status" };

/**
 * Admin overview = health of the application and the server it runs on.
 * Shop-floor status (groomers, stations, appointments) lives on /staff;
 * feature switches live on their own settings pages.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface MigrationRow {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

/** Host and database name from DATABASE_URL — never the credentials. */
function describeDatabaseUrl(raw: string | undefined): string {
  if (!raw) return "DATABASE_URL not set";
  try {
    const url = new URL(raw);
    const database = url.pathname.replace(/^\//, "");
    return `${url.hostname}:${url.port || "5432"}/${database || "?"}`;
  } catch {
    return "DATABASE_URL is not a valid URL";
  }
}

/**
 * The dot is the only thing separating a healthy row from a failing one, and
 * colour alone is not a signal (WCAG 1.4.1) — a screen reader gets nothing and
 * red/green is the commonest form of colour blindness. The dot carries the
 * state as text for assistive tech; sighted users read it from the dot.
 */
function StatusDot({ ok, warn = false }: { ok: boolean; warn?: boolean }) {
  const color = ok ? (warn ? "bg-amber-500" : "bg-green-500") : "bg-red-500";
  const state = ok ? (warn ? "Warning" : "OK") : "Problem";
  return (
    <span
      role="img"
      aria-label={state}
      title={state}
      className={`inline-block w-2 h-2 rounded-full ${color} flex-shrink-0`}
    />
  );
}

function Row({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-stone-100 last:border-0">
      <span className="text-sm text-stone-500">{label}</span>
      <span className="text-sm font-medium text-stone-800 text-right flex items-center gap-2 break-all">
        {ok !== undefined && <StatusDot ok={ok} warn={warn} />}
        {value}
      </span>
    </div>
  );
}

/**
 * Round-trips the database and times it. Kept out of the component body: it
 * reads a clock, which a render may not do.
 */
async function probeDatabase() {
  try {
    const started = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Math.round(performance.now() - started);
    const rows = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
    return {
      dbOnline: true,
      dbError: "",
          dbLatencyMs,
      // "PostgreSQL 16.4 on x86_64…" — the first two words are the useful part
      dbVersion: rows[0]?.version.split(" ").slice(0, 2).join(" ") ?? "unknown",
    };
  } catch (error) {
    return {
      dbOnline: false,
      dbError: error instanceof Error ? error.message : String(error),
          dbLatencyMs: 0,
          dbVersion: "",
    };
  }
}

export default async function AdminOverview() {
  // Technical screen: a shop manager runs the shop, an admin runs the system.
  if (!(await currentStaffIsAdmin())) redirect("/staff");

  const now = new Date();

  // ── Database probe ────────────────────────────────────────────
  const { dbOnline, dbError, dbLatencyMs, dbVersion } = await probeDatabase();

  let migrations: MigrationRow[] = [];
  let migrationError = "";
  if (dbOnline) {
    try {
      migrations = await prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at
        FROM _prisma_migrations
        ORDER BY started_at DESC
        LIMIT 5
      `;
    } catch (error) {
      migrationError = error instanceof Error ? error.message : String(error);
    }
  }

  // ── Record counts + config ────────────────────────────────────
  let config = null;
  let counts: { label: string; value: number }[] = [];
  if (dbOnline) {
    const [
      loadedConfig,
      customers,
      pets,
      staff,
      stations,
      appointments,
      statusHistory,
      visitEvents,
      waivers,
    ] = await Promise.all([
      getConfig(),
      prisma.customer.count(),
      prisma.pet.count(),
      prisma.staff.count(),
      prisma.station.count(),
      prisma.appointment.count(),
      prisma.appointmentStatusHistory.count(),
      prisma.visitEvent.count(),
      prisma.waiverAcceptance.count(),
    ]);
    config = loadedConfig;
    counts = [
      { label: "Customers", value: customers },
      { label: "Pets", value: pets },
      { label: "Staff", value: staff },
      { label: "Stations", value: stations },
      { label: "Appointments", value: appointments },
      { label: "Status history", value: statusHistory },
      { label: "Visit events", value: visitEvents },
      { label: "Waiver acceptances", value: waivers },
    ];
  }

  // ── Process / runtime ─────────────────────────────────────────
  const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const nodeEnv = process.env.NODE_ENV;
  const authSecretSet = Boolean(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET);
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "";
  const resendKeySet = Boolean(process.env.RESEND_API_KEY);

  // ── Station SSE fan-out (per process — see lib/station-events) ─
  const subscriptions = stationSubscriberCounts();
  const liveConnections = subscriptions.reduce((n, s) => n + s.connections, 0);

  const twilioConfigured = Boolean(
    config?.twilioAccountSid && config?.twilioAuthToken && config?.twilioFromNumber
  );

  const tiles = [
    {
      label: "Database",
      value: dbOnline ? `${dbLatencyMs} ms` : "Unreachable",
      tone: dbOnline ? "text-green-700" : "text-red-600",
      sub: dbOnline ? dbVersion : "Connection failed",
    },
    {
      label: "Process uptime",
      value: formatUptime(process.uptime()),
      tone: "text-stone-900",
      sub: `${memoryMb} MB resident`,
    },
    {
      label: "Environment",
      value: nodeEnv ?? "unknown",
      tone: nodeEnv === "production" ? "text-stone-900" : "text-amber-700",
      sub: `Node ${process.version}`,
    },
    {
      label: "App version",
      value: `v${pkg.version}`,
      tone: "text-stone-900",
      sub: `Next.js ${pkg.dependencies.next}`,
    },
  ];

  return (
    <PageShell
      title="System Status"
      subtitle={`Read live at ${formatShopTime(now)} on ${formatShopDate(now)} (${SHOP_TIMEZONE}).`}
    >
      {!dbOnline && (
        <div className="border-t border-stone-100 bg-red-50 px-3 py-2">
          <p className="text-sm font-semibold text-red-800">Database unreachable</p>
          <p className="text-sm text-red-700 mt-1 break-all">{dbError}</p>
        </div>
      )}

      {/* Headline tiles */}
      <PageSection tone="muted" bodyClassName="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(({ label, value, tone, sub }) => (
          <div key={label} className="border border-stone-200 rounded-lg bg-white p-4">
            <p className={`text-2xl font-black ${tone}`}>{value}</p>
            <p className="text-sm text-stone-500 mt-1">{label}</p>
            <p className="text-xs text-stone-400 mt-0.5 truncate">{sub}</p>
          </div>
        ))}
      </PageSection>

      <PageSection bodyClassName="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Database */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3 mb-2">
            Database
          </h2>
          <Row
            label="Connection"
            value={dbOnline ? `Online · ${dbLatencyMs} ms` : "Unreachable"}
            ok={dbOnline}
            warn={dbOnline && dbLatencyMs > 250}
          />
          <Row label="Server" value={dbOnline ? dbVersion : "—"} />
          <Row label="Target" value={describeDatabaseUrl(process.env.DATABASE_URL)} />
          {migrationError ? (
            <Row label="Migrations" value="Migration table unreadable" ok={false} />
          ) : (
            <Row
              label="Migrations applied"
              value={
                migrations.length === 0
                  ? "None recorded"
                  : `${migrations[0].migration_name}${
                      migrations[0].finished_at ? "" : " (incomplete)"
                    }`
              }
              ok={migrations.length > 0 && Boolean(migrations[0]?.finished_at)}
            />
          )}
          {migrations.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-stone-400">
              {migrations.map((migration) => (
                <li key={migration.migration_name} className="flex justify-between gap-3">
                  <span className="truncate">{migration.migration_name}</span>
                  <span className="whitespace-nowrap">
                    {migration.rolled_back_at
                      ? "rolled back"
                      : migration.finished_at
                        ? formatShopDate(new Date(migration.finished_at))
                        : "pending"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Runtime */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3 mb-2">
            Runtime
          </h2>
          <Row label="Node.js" value={process.version} />
          <Row label="Platform" value={`${process.platform} · ${process.arch}`} />
          <Row label="Process ID" value={String(process.pid)} />
          <Row label="Resident memory" value={`${memoryMb} MB`} warn={memoryMb > 900} ok={memoryMb <= 1400} />
          <Row
            label="NODE_ENV"
            value={nodeEnv ?? "unset"}
            ok={nodeEnv === "production"}
            warn={nodeEnv !== "production"}
          />
          <Row label="Shop timezone" value={SHOP_TIMEZONE} />
          <Row
            label="Config last edited"
            value={
              config
                ? `${formatShopDate(config.updatedAt)} ${formatShopTime(config.updatedAt)}`
                : "—"
            }
          />
        </section>

        {/* Station displays */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3 mb-2">
            Station Displays (SSE)
          </h2>
          <Row
            label="Live connections"
            value={String(liveConnections)}
            ok={liveConnections > 0}
            warn={liveConnections === 0}
          />
          <Row label="Stations streaming" value={String(subscriptions.length)} />
          {subscriptions.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-stone-500">
              {subscriptions.map(({ stationId, connections }) => (
                <li key={stationId} className="flex justify-between gap-3">
                  <Link href={`/station/${stationId}`} className="truncate hover:text-amber-700 underline">
                    {stationId}
                  </Link>
                  <span className="whitespace-nowrap">
                    {connections} screen{connections !== 1 ? "s" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-stone-400 mt-3">
            Counts are per app process. Live updates rely on this single instance — running more
            than one replica needs a shared pub/sub layer before these numbers mean anything
            shop-wide.
          </p>
        </section>

        {/* Integrations */}
        <section className="border border-stone-200 rounded-lg bg-well p-4">
          <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3 mb-2">
            Integrations
          </h2>
          <Row
            label="Auth secret"
            value={authSecretSet ? "Set" : "Missing"}
            ok={authSecretSet}
          />
          <Row label="Auth URL" value={authUrl || "unset (derived from request)"} />
          <Row
            label="Email sender (Resend)"
            value={resendKeySet ? "API key set" : "No API key — email is a no-op"}
            ok={resendKeySet}
            warn={resendKeySet && !config?.featureEmailNotify}
          />
          <Row
            label="Email notifications"
            value={config?.featureEmailNotify ? "Enabled" : "Disabled"}
            ok={Boolean(config?.featureEmailNotify)}
            warn={!config?.featureEmailNotify}
          />
          <Row
            label="From address"
            value={config?.emailFromAddress ?? process.env.EMAIL_FROM ?? "default fallback"}
          />
          <Row
            label="SMS credentials"
            value={twilioConfigured ? "Stored" : "Not configured"}
            ok={twilioConfigured}
            warn={!twilioConfigured}
          />
          {config?.featureSmsNotify && (
            <p className="text-xs text-amber-700 mt-3">
              SMS notifications are switched on, but this build ships no SMS sender — nothing is
              transmitted. Turn the flag off on the Notifications page until a provider is wired up.
            </p>
          )}
        </section>
      </PageSection>

      {/* Stored records */}
      <PageSection title="Stored Records" padded={false}>
        {dbOnline ? (
          <div className="border-t border-stone-100 mt-2 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-stone-100">
            {counts.map(({ label, value }) => (
              <div key={label} className="p-5">
                <p className="text-xl font-black text-stone-900">{value}</p>
                <p className="text-xs text-stone-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-3 py-4 text-center text-stone-400 text-sm">
            Counts unavailable while the database is unreachable.
          </p>
        )}
      </PageSection>
    </PageShell>
  );
}
