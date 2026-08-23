import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

async function toggleStaffActive(formData: FormData) {
  "use server";

  const id = formData.get("id") as string;
  const currentActive = formData.get("currentActive") === "true";

  await prisma.staff.update({
    where: { id },
    data: { isActive: !currentActive },
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff");
}

function RoleBadge({ role }: { role: string }) {
  if (role === "ADMIN") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
        Admin
      </span>
    );
  }
  if (role === "GROOMER") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-700">
        Groomer
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-500">
      {role}
    </span>
  );
}

export default async function StaffPage() {
  const staffList = await prisma.staff.findMany({
    orderBy: { name: "asc" },
  });

  const activeCount = staffList.filter((s) => s.isActive).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Staff</h1>
          <p className="text-sm text-stone-500 mt-1">
            {activeCount} of {staffList.length} staff members active.
          </p>
        </div>
        <Link
          href="/admin/staff/new"
          className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + Add Staff
        </Link>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {staffList.length === 0 ? (
          <div className="py-16 text-center text-stone-400 text-sm">
            No staff members found.{" "}
            <Link href="/admin/staff/new" className="text-amber-700 hover:underline font-medium">
              Add the first one.
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Email
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Role
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-5 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {staffList.map((staff) => (
                <tr key={staff.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {staff.name
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span className="font-medium text-stone-800">{staff.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-stone-500">{staff.email}</td>
                  <td className="px-5 py-4">
                    <RoleBadge role={staff.role} />
                  </td>
                  <td className="px-5 py-4">
                    {staff.isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-green-700 text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-stone-400 text-xs font-medium">
                        <span className="w-2 h-2 rounded-full bg-stone-300" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/admin/staff/${staff.id}/edit`}
                        className="text-amber-700 hover:text-amber-900 text-xs font-medium"
                      >
                        Edit
                      </Link>
                      <form action={toggleStaffActive}>
                        <input type="hidden" name="id" value={staff.id} />
                        <input
                          type="hidden"
                          name="currentActive"
                          value={String(staff.isActive)}
                        />
                        <button
                          type="submit"
                          className={`text-xs font-medium ${
                            staff.isActive
                              ? "text-stone-500 hover:text-red-600"
                              : "text-stone-500 hover:text-green-700"
                          } transition-colors`}
                        >
                          {staff.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
