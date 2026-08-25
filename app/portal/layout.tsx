import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");
  const [config, customer] = await Promise.all([
    getConfig(),
    prisma.customer.findUnique({
      where: { id: session.user.id },
      select: { themePreference: true },
    }),
  ]);

  return (
    <div className={`min-h-screen bg-stone-50 flex flex-col ${customer?.themePreference === "DARK" ? "dark" : ""}`}>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-bold text-brand-text">🐾 {config.shopName}</Link>
            <nav className="hidden md:flex gap-3 text-sm text-stone-600">
              <Link href="/portal" className="hover:text-brand-text">Dashboard</Link>
              <Link href="/portal/pets" className="hover:text-brand-text">My Pets</Link>
              <Link href="/portal/appointments" className="hover:text-brand-text">Appointments</Link>
              <Link href="/portal/profile" className="hover:text-brand-text">Profile</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-stone-500">{session.user.name}</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
              <button className="text-stone-400 hover:text-stone-700">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main id="main-content" className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">{children}</main>
    </div>
  );
}
