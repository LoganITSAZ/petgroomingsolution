import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/settings", label: "Shop Settings" },
  { href: "/admin/features", label: "Features" },
  { href: "/admin/waiver", label: "Liability Waiver" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/stations", label: "Stations" },
  { href: "/admin/notifications", label: "Notifications" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/staff");

  return (
    <div className="min-h-screen bg-stone-50 flex">
      <aside className="w-56 bg-amber-950 text-amber-100 flex flex-col py-6 px-4 fixed h-full">
        <p className="font-bold text-white mb-1 px-2">⚙ Admin Panel</p>
        <Link href="/staff" className="text-xs text-amber-400 hover:text-white px-2 mb-8 block">
          ← Back to Dashboard
        </Link>
        <nav className="flex-1 space-y-1 text-sm">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="block px-3 py-2 rounded-lg hover:bg-amber-900 transition-colors">
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 ml-56 p-8 max-w-4xl">{children}</main>
    </div>
  );
}
