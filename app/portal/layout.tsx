import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold text-brand-700">🐾 Gentle Groomer</Link>
            <nav className="hidden md:flex gap-4 text-sm text-stone-600">
              <Link href="/portal" className="hover:text-brand-600">Dashboard</Link>
              <Link href="/portal/pets" className="hover:text-brand-600">My Pets</Link>
              <Link href="/portal/appointments" className="hover:text-brand-600">Appointments</Link>
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
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">{children}</main>
    </div>
  );
}
