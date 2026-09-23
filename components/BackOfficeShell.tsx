import { auth, signOut } from "@/lib/auth";
import { canManage, getStaffRoles } from "@/lib/staff-roles";
import { resolveTheme, themeCss } from "@/lib/themes";
import { shopDayKey, isFloorStaff } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { isEnabled, type FeatureKey } from "@/lib/features";
import { headers } from "next/headers";
import SystemThemeScript from "@/components/SystemThemeScript";
import PresenceSwitcher from "@/components/PresenceSwitcher";
import MobileMenu from "@/components/MobileMenu";
import { setMyPresence } from "@/app/staff/presence-actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import NavLink from "@/components/NavLink";
import OfficeIcon from "@/components/OfficeIcon";

/**
 * One back office, one shell. Staff and admin screens are the same product to
 * the person using them, so they share a sidebar, grouped by what a person is
 * there to do rather than by who is allowed in: Floor for everyone, then
 * Manage, Insights and Settings for whoever runs the shop (ADMIN or MANAGER),
 * and System for ADMIN alone.
 *
 * Two shapes, one layout: a fixed sidebar on a shop terminal, and a top bar
 * with a drawer on a phone — groomers set their presence from the floor, and
 * the sidebar is not reachable one-handed.
 *
 * Roles come from `getStaffRoles`, which reads the database rather than the
 * token, so a role granted after sign-in shows up without a logout. Hiding a
 * link is presentation only: /admin/* is still gated by the admin layout and
 * every mutation by `requireAdmin()`.
 */

/** A sidebar entry. `feature` hides the row when the shop has that feature off. */
interface NavItem {
  href: string;
  label: string;
  feature?: FeatureKey;
}

const NAV: NavItem[] = [
  { href: "/staff", label: "Dashboard" },
  { href: "/staff/appointments", label: "Appointments" },
  { href: "/staff/customers", label: "Customers" },
  { href: "/staff/stations", label: "Stations" },
  { href: "/staff/team", label: "Team" },
  { href: "/staff/schedule", label: "Schedule" },
  { href: "/staff/services", label: "Services" },
  { href: "/staff/payments", label: "Payments", feature: "featureCounterPayments" },
  { href: "/staff/resources", label: "Resources" },
];

/**
 * What the shop edits about itself: the records and documents a manager
 * changes during a working week. One flat "Shop" group carried all eleven of
 * these, which put "Loyalty Tiers" and "Appearance" — a rate a customer is on
 * and the colour of the website — in the same list with nothing between them.
 */
const MANAGE_NAV: NavItem[] = [
  { href: "/admin/services", label: "Services & Pricing" },
  { href: "/admin/loyalty", label: "Loyalty Tiers" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/schedule", label: "Scheduling" },
  { href: "/admin/stations", label: "Stations" },
  { href: "/admin/marketing", label: "Marketing" },
  { href: "/admin/testimonials", label: "Testimonials", feature: "featureTestimonials" },
];

/** What the shop reads about itself. Nothing here is editable. */
const INSIGHTS_NAV: NavItem[] = [
  // Analytics keeps its /staff URL — a groomer's saved link should not
  // break — but it is a shop screen: it carries the leaderboard and every
  // groomer's estimated pay.
  { href: "/staff/analytics", label: "Analytics" },
  { href: "/admin/reports", label: "Reports" },
];

/** Set once and left alone. */
const SETTINGS_NAV: NavItem[] = [
  { href: "/admin/settings", label: "Shop Settings" },
  { href: "/admin/appearance", label: "Appearance" },
];

/**
 * The technical screens. A shop manager runs everything above; system status
 * and the notification credentials stay with ADMIN, and both pages re-check
 * for themselves — hiding a link is presentation, never the gate.
 */
const TECHNICAL_NAV: NavItem[] = [
  { href: "/admin", label: "System Status" },
  { href: "/admin/notifications", label: "Notifications" },
  { href: "/admin/contact", label: "Contact Form" },
];

/** A group header names a scope, never a page. */
function NavGroup({ label, items, first = false }: { label: string; items: NavItem[]; first?: boolean }) {
  return (
    <>
      <p
        className={`px-3 pb-1 font-display text-[0.8125rem] font-bold tracking-tight nav-group-label text-brand-text ${first ? "" : "mt-4 border-t border-line pt-3"}`}
      >
        {label}
      </p>
      {items.map((item) => (
        <NavLink key={item.href} href={item.href} label={item.label} />
      ))}
    </>
  );
}

export default async function BackOfficeShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") redirect("/login?type=staff");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const [roles, me, config] = await Promise.all([
    getStaffRoles(session.user.id),
    prisma.staff.findUnique({
      where: { id: session.user.id },
      select: { presence: true, themePreference: true },
    }),
    getConfig(),
  ]);
  const [, month, day] = shopDayKey(new Date()).split("-").map(Number);
  const theme = resolveTheme(config, { month, day });
  const isAdmin = roles.includes("ADMIN");
  const canManageShop = canManage(roles);
  // Presence describes someone who takes pets. An admin-only account never
  // does, so it gets no status and no shift page; an admin who also grooms
  // gets both, because the roles stack.
  const onFloor = isFloorStaff(roles);
  const presence = me?.presence ?? "OFF_SHIFT";

  /*
   * A feature that is off takes its nav rows with it. Presentation only — the
   * page behind each one redirects for itself, the same rule the admin links
   * follow.
   */
  const live = (items: NavItem[]) =>
    items.filter((item) => !item.feature || isEnabled(config, item.feature));

  const links = (
    <>
      <NavGroup
        first
        label="Storefront"
        items={live(onFloor ? [...NAV.slice(0, 1), { href: "/staff/me", label: "My Shift" }, ...NAV.slice(1)] : NAV)}
      />
      {canManageShop && (
        <>
          <NavGroup label="Management" items={live(MANAGE_NAV)} />
          <NavGroup label="Insights" items={live(INSIGHTS_NAV)} />
          <NavGroup label="Settings" items={live(SETTINGS_NAV)} />
        </>
      )}
      {isAdmin && <NavGroup label="System" items={live(TECHNICAL_NAV)} />}
    </>
  );

  return (
    <div
      id="back-office-root"
      className={`liquid-shell app-dense min-h-screen bg-page text-ink md:flex ${me?.themePreference === "DARK" ? "dark" : ""}`}
    >
      <style nonce={nonce} dangerouslySetInnerHTML={{ __html: themeCss(theme.tokens, "#back-office-root") }} />
      {me?.themePreference === "SYSTEM" && <SystemThemeScript rootId="back-office-root" nonce={nonce} />}

      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Phone: presence first, navigation behind a tap */}
      <header className="office-mobile-header md:hidden sticky top-0 z-40 office-navigation border-b border-line px-3 py-2">
        <div className="flex items-center gap-3">
          <MobileMenu summaryClassName="nav-menu-toggle" menuClassName="office-navigation border border-line max-h-[75dvh] overflow-y-auto">{links}</MobileMenu>

          <Link href="/staff" className="font-display font-extrabold tracking-tight text-ink truncate">
            <span className="office-mobile-brand"><OfficeIcon name="paw" /> {config.shopName}</span>
          </Link>

          {onFloor && (
            <div className="ml-auto w-36">
              <PresenceSwitcher action={setMyPresence} current={presence} returnTo="/staff/me" />
            </div>
          )}
        </div>
      </header>

      {/* Terminal: the familiar sidebar */}
      <aside className="office-sidebar hidden md:flex w-60 office-navigation border-r border-line flex-col py-5 px-3 fixed h-full">
        {/* The display face at text-lg put a two-word shop name on the first
            group header. Tight leading and its own space, rather than an
            ellipsis — a shop should not read its own name cut off. */}
        <Link
          href="/"
          className="office-workspace"
        >
          <span className="office-brand-mark"><OfficeIcon name="paw" /></span>
          <span className="min-w-0"><span className="office-workspace-name">{config.shopName}</span><span className="office-workspace-caption">Business workspace</span></span>
        </Link>
        {/* The admin group makes this list long enough to outrun a short screen. */}
        <nav aria-label="Workspace navigation" className="flex-1 space-y-1 text-sm overflow-y-auto">{links}</nav>
        <div className="office-account text-xs text-muted px-2 space-y-1 pt-3 mt-3 border-t border-line">
          {/* Presence: the control the floor touches most */}
          {onFloor && (
            <PresenceSwitcher action={setMyPresence} current={presence} returnTo="/staff" />
          )}
          <Link
            href="/staff/profile"
            className="office-profile"
          >
            <span className="office-avatar" aria-hidden="true">{session.user.name?.trim().charAt(0).toUpperCase() || "U"}</span>
            <span><span className="block font-semibold text-ink">{session.user.name}</span><span className="block text-xs text-muted">My account</span></span>
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="text-muted hover:text-ink mt-1">Sign out</button>
          </form>
        </div>
      </aside>

      {/* On a terminal the shell owns the viewport, so a page card's own scroll
          band does the scrolling and its scrollbar stays on screen. Phones keep
          document scroll — there is no visible bar to strand there. */}
      <main
        id="main-content"
        className="flex-1 min-w-0 md:ml-60 p-3 md:p-6 flex flex-col md:h-screen md:overflow-hidden"
      >
        {children}
      </main>
    </div>
  );
}
