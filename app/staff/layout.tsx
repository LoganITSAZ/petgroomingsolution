import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { signOut } from "@/lib/auth";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") redirect("/login?type=staff");

  const isAdmin = session.user.role === "ADMIN";

  return (
    <div className="min-h-screen bg-stone-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-stone-900 text-stone-200 flex flex-col py-6 px-4 fixed h-full">
        <Link href="/" className="font-bold text-white text-lg mb-8 px-2">🐾 Gentle Groomer</Link>
        <nav className="flex-1 space-y-1 text-sm">
          <Link href="/staff" className="block px-3 py-2 rounded-lg hover:bg-stone-700 transition-colors">Dashboard</Link>
          <Link href="/staff/appointments" className="block px-3 py-2 rounded-lg hover:bg-stone-700 transition-colors">Appointments</Link>
          <Link href="/staff/directory" className="block px-3 py-2 rounded-lg hover:bg-stone-700 transition-colors">Customers &amp; Pets</Link>
          {isAdmin && (
            <>
              <hr className="border-stone-700 my-3" />
              <Link href="/admin" className="block px-3 py-2 rounded-lg hover:bg-stone-700 transition-colors text-amber-400">
                ⚙ Admin Panel
              </Link>
            </>
          )}
        </nav>
        <div className="text-xs text-stone-500 px-2 space-y-1">
          <p>{session.user.name}</p>
          <p className="capitalize">{session.user.role.toLowerCase()}</p>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button className="text-stone-400 hover:text-white mt-1">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 ml-56 p-8">{children}</main>
    </div>
  );
}
