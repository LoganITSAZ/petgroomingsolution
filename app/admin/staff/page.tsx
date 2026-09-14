import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import Link from "next/link";
import { getConfig } from "@/lib/config";
import { formatRole, roleBadgeClass } from "@/lib/utils";
import { setDefaultCommission } from "./actions";
import { PageShell, PageSection } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Staff" };

async function toggleStaffActive(formData: FormData) {
  "use server";

  await requireManager();

  const id = formData.get("id") as string;
  const currentActive = formData.get("currentActive") === "true";

  await prisma.staff.update({
    where: { id },
    data: { isActive: !currentActive },
  });

  revalidatePath("/admin/staff");
  redirect("/admin/staff");
}

function RoleBadges({ roles }: { roles: string[] }) {
  if (roles.length === 0) {
    return <span className="text-xs text-stone-400">No roles</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span
          key={role}
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadgeClass(role)}`}
        >
          {formatRole(role)}
        </span>
      ))}
    </span>
  );
}

interface PageProps {
  searchParams: Promise<{
    created?: string;
    saved?: string;
    commission?: string;
    error?: string;
  }>;
}

export default async function StaffPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const [staffList, config] = await Promise.all([
    prisma.staff.findMany({ orderBy: { name: "asc" } }),
    getConfig(),
  ]);

  const activeCount = staffList.filter((s) => s.isActive).length;

  return (
    <PageShell
      title="Staff"
      subtitle={
        <>
          {activeCount} of {staffList.length} staff members active · default commission{" "}
          {config.defaultCommissionPercent}%
        </>
      }
      actions={
        <Link
          href="/admin/staff/new"
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          + Add Staff
        </Link>
      }
    >

      {(searchParams.created || searchParams.saved) && (
        <p className="border-t border-stone-100 bg-green-50 text-green-800 px-3 py-2 text-sm font-medium">
          {searchParams.created ? `${searchParams.created} added.` : `${searchParams.saved} saved.`}
        </p>
      )}
      {searchParams.commission === "1" && (
        <p className="border-t border-stone-100 bg-green-50 text-green-800 px-3 py-2 text-sm font-medium">
          Default commission updated.
        </p>
      )}
      {searchParams.error === "bad_commission" && (
        <p className="border-t border-stone-100 bg-red-50 text-red-800 px-3 py-2 text-sm font-medium">
          Commission has to be between 0 and 100.
        </p>
      )}

      {/* Pay basis for anyone without their own rate */}
      <form
        action={setDefaultCommission}
        className="border-t border-stone-100 bg-stone-50 px-3 py-2 flex flex-wrap items-center gap-3"
      >
        <span className="text-sm font-semibold text-stone-800">Default commission</span>
        <span className="flex items-center gap-2">
          <input
            name="defaultCommissionPercent"
            aria-label="Default commission percent"
            inputMode="decimal"
            defaultValue={config.defaultCommissionPercent}
            className="w-20 border border-stone-200 rounded-lg px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-stone-500">%</span>
        </span>
        <button
          type="submit"
          className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-1.5 rounded-lg text-sm font-semibold"
        >
          Save
        </button>
        <span className="text-xs text-stone-400">
          Used for estimated pay in analytics when a groomer has no rate of their own.
        </span>
      </form>

      <PageSection grow scroll padded={false}>
        {staffList.length === 0 ? (
          <div className="py-8 text-center text-stone-400 text-sm">
            No staff members found.{" "}
            <Link href="/admin/staff/new" className="text-amber-700 hover:underline font-medium">
              Add the first one.
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-left">
                <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight">
                  Name
                </th>
                <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight">
                  Email
                </th>
                <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight">
                  Roles
                </th>
                <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight">
                  Commission
                </th>
                <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight">
                  Status
                </th>
                <th scope="col" className="px-4 py-2 text-xs font-semibold text-stone-500 tracking-tight text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {staffList.map((staff) => (
                <tr key={staff.id} className="hover:bg-well transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {staff.name
                          .split(" ")
                          .map((n: string) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <Link
                        href={`/admin/staff/${staff.id}/edit`}
                        className="font-medium text-stone-800 hover:text-amber-700"
                      >
                        {staff.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-stone-500">{staff.email}</td>
                  <td className="px-4 py-2.5">
                    <RoleBadges roles={staff.roles} />
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">
                    {staff.commissionPercent != null ? (
                      `${staff.commissionPercent}%`
                    ) : (
                      <span className="text-stone-400">
                        {config.defaultCommissionPercent}% (default)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
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
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
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
      </PageSection>
    </PageShell>
  );
}
