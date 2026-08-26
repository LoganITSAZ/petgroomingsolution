import { auth, signOut } from "@/lib/auth";
import { canManage, getStaffRoles } from "@/lib/staff-roles";
import { isFloorStaff } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import SystemThemeScript from "@/components/SystemThemeScript";
import PresenceSwitcher from "@/components/PresenceSwitcher";
import MobileMenu from "@/components/MobileMenu";
import { setMyPresence } from "@/app/staff/presence-actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import NavLink from "@/components/NavLink";

/**
 * One back office, one shell. Staff and admin screens are the same product to
 * the person using them, so they share a sidebar: the floor links everyone
 * gets, then the shop group for whoever runs the shop (ADMIN or MANAGER), and
 * the technical group below it for ADMIN alone.
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

const NAV = [
  { href: "/staff", label: "Dashboard" },
  { href: "/staff/appointments", label: "Appointments" },
  { href: "/staff/customers", label: "Customers" },
  { href: "/staff/stations", label: "Stations" },
  { href: "/staff/team", label: "Staff" },
  { href: "/staff/schedule", label: "Schedule" },
  { href: "/staff/services", label: "Services" },
  { href: "/staff/resources", label: "Resources" },
];

const ADMIN_NAV = [
  { href: "/admin/services", label: "Services & Pricing" },
  { href: "/admin/pricing", label: "Pricing Tiers" },
  { href: "/admin/staff", label: "Manage Staff" },
  { href: "/admin/schedule", label: "Edit Schedule" },
  { href: "/admin/stations", label: "Manage Stations" },
  { href: "/admin/marketing", label: "Marketing" },
  // Analytics keeps its /staff URL — a groomer's saved link should not
  // break — but it is a shop screen: it carries the leaderboard and every
  // groomer's estimated pay.
  { href: "/staff/analytics", label: "Analytics" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/appearance", label: "Appearance" },
  { href: "/admin/settings", label: "Shop Settings" },
  { href: "/admin/waiver", label: "Liability Waiver" },
];

/**
 * The technical screens. A shop manager runs everything above; system status
 * and the notification credentials stay with ADMIN, and both pages re-check
 * for themselves — hiding a link is presentation, never the gate.
 */
const TECHNICAL_NAV = [
  { href: "/admin", label: "System Status" },
  { href: "/admin/notifications", label: "Notifications" },
];

export default async function BackOfficeShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") redirect("/login?type=staff");

  const [roles, me, config] = await Promise.all([
    getStaffRoles(session.user.id),
    prisma.staff.findUnique({
      where: { id: session.user.id },
      select: { presence: true, themePreference: true },
    }),
    getConfig(),
  ]);
  const isAdmin = roles.includes("ADMIN");
  const canManageShop = canManage(roles);
  // Presence describes someone who takes pets. An admin-only account never
  // does, so it gets no status and no shift page; an admin who also grooms
  // gets both, because the roles stack.
  const onFloor = isFloorStaff(roles);
  const presence = me?.presence ?? "OFF_SHIFT";

  const links = (
    <>
      <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
        Floor
      </p>
      {(onFloor ? [...NAV.slice(0, 1), { href: "/staff/me", label: "My Shift" }, ...NAV.slice(1)] : NAV).map((item) => (
        <NavLink key={item.href} href={item.href} label={item.label} />
      ))}
      {canManageShop && (
        <>
          <hr className="border-stone-700 mt-3 mb-1" />
          <p className="px-3 py-1 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
            Shop
          </p>
          {ADMIN_NAV.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </>
      )}
      {isAdmin && (
        <>
          <hr className="border-stone-700 mt-3 mb-1" />
          <p className="px-3 py-1 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
            Admin
          </p>
          {TECHNICAL_NAV.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </>
      )}
    </>
  );

  return (
    <div
      id="back-office-root"
      className={`app-dense min-h-screen bg-stone-100 md:flex ${me?.themePreference === "DARK" ? "dark" : ""}`}
    >
      {me?.themePreference === "SYSTEM" && <SystemThemeScript rootId="back-office-root" />}

      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Phone: presence first, navigation behind a tap */}
      <header className="md:hidden sticky top-0 z-40 bg-stone-900 text-stone-200 px-3 py-2">
        <div className="flex items-center gap-3">
          <MobileMenu>{links}</MobileMenu>

          <Link href="/staff" className="font-bold text-white truncate">
            🐾 {session.user.name}
          </Link>

          {onFloor && (
            <div className="ml-auto w-36">
              <PresenceSwitcher action={setMyPresence} current={presence} returnTo="/staff/me" />
            </div>
          )}
        </div>
      </header>

      {/* Terminal: the familiar sidebar */}
      <aside className="hidden md:flex w-48 bg-stone-900 text-stone-200 flex-col py-5 px-3 fixed h-full">
        <Link href="/" className="font-bold text-white text-lg mb-3 px-2">
            🐾 {config.shopName}
        </Link>
        {/* The admin group makes this list long enough to outrun a short screen. */}
        <nav className="flex-1 space-y-1 text-sm overflow-y-auto">{links}</nav>
        <div className="text-xs text-stone-300 px-2 space-y-1 pt-2">
          {/* Presence: the control the floor touches most */}
          {onFloor && (
            <PresenceSwitcher action={setMyPresence} current={presence} returnTo="/staff" />
          )}
          <Link
            href="/staff/profile"
            className="block pt-1 text-stone-300 hover:text-white hover:underline"
          >
            {session.user.name}
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="text-stone-300 hover:text-white mt-1">Sign out</button>
          </form>
        </div>
      </aside>

      <main id="main-content" className="flex-1 md:ml-48 p-3 md:p-4 flex flex-col">{children}</main>
    </div>
  );
}
