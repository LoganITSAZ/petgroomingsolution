import { StaffRole } from "@prisma/client";
import Link from "next/link";
import { PageSection } from "@/components/ui";
import TagPicker from "@/components/TagPicker";

/**
 * One form for hiring and for editing. Commission is per person, blank meaning
 * "use the shop default".
 */

const inputClass =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm ";

export interface StationOption {
  id: string;
  name: string;
}

export interface StaffFormValues {
  id?: string;
  name: string;
  email: string;
  roles: StaffRole[];
  defaultStationId: string | null;
  isActive: boolean;
  commissionPercent: number | null;
}

const ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: "Admin — full access, including the technical screens",
  MANAGER: "Shop manager — runs the shop, no technical screens",
  GROOMER: "Groomer — grooms pets",
  BATHER: "Bather — bathing and prep",
};

export default function StaffForm({
  action,
  initial,
  submitLabel,
  defaultCommission,
  stations,
}: {
  action: (formData: FormData) => Promise<void>;
  initial: StaffFormValues;
  submitLabel: string;
  defaultCommission: number;
  stations: StationOption[];
}) {
  const editing = Boolean(initial.id);

  return (
    <form action={action}>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <PageSection bodyClassName="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block font-medium text-stone-700 mb-1">Name</span>
            <input name="name" required defaultValue={initial.name} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="block font-medium text-stone-700 mb-1">Email</span>
            <input
              name="email"
              type="email"
              required
              defaultValue={initial.email}
              className={inputClass}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block font-medium text-stone-700 mb-1">Commission %</span>
            <input
              name="commissionPercent"
              inputMode="decimal"
              defaultValue={initial.commissionPercent ?? ""}
              placeholder={`${defaultCommission} (shop default)`}
              className={inputClass}
            />
            <span className="block text-xs text-stone-400 mt-1">
              Leave blank to use the shop default of {defaultCommission}%.
            </span>
          </label>
        </div>

        <div className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Roles</span>
          <TagPicker
            name="roles"
            initialIds={initial.roles}
            options={Object.values(StaffRole).map((role) => ({
              id: role,
              label: ROLE_LABEL[role],
            }))}
            addLabel="+ Add a role"
            emptyLabel="No roles yet"
            noun="role"
          />
          <span className="block text-xs text-stone-400 mt-1">
            Someone can hold several — a groomer who also baths, an admin who still works the
            floor. Admin is what unlocks the admin panel.
          </span>
        </div>

        <label className="text-sm block">
          <span className="block font-medium text-stone-700 mb-1">Home station</span>
          <select
            name="defaultStationId"
            defaultValue={initial.defaultStationId ?? ""}
            className={inputClass}
          >
            <option value="">No fixed station</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
          <span className="block text-xs text-stone-400 mt-1">
            Appointments booked with this person default to this station.
          </span>
        </label>

        <label className="text-sm block">
          <span className="block font-medium text-stone-700 mb-1">
            {editing ? "New password" : "Password"}
          </span>
          <input
            name="password"
            type="password"
            required={!editing}
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
          <span className="block text-xs text-stone-400 mt-1">
            {editing
              ? "Leave blank to keep the current password. At least 8 characters."
              : "At least 8 characters."}
          </span>
        </label>

        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={initial.isActive}
            className="accent-amber-700"
          />
          Active — can sign in and be assigned pets
        </label>
      </PageSection>

      <PageSection tone="muted" bodyClassName="flex justify-end gap-3">
        <Link
          href="/admin/staff"
          className="px-5 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-6 py-2 rounded-lg text-sm font-semibold"
        >
          {submitLabel}
        </button>
      </PageSection>
    </form>
  );
}
