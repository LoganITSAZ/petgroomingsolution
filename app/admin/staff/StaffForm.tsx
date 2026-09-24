import { ServiceCategory, StaffRole } from "@prisma/client";
import Link from "next/link";
import { PageSection } from "@/components/ui";
import TagPicker from "@/components/TagPicker";
import { SERVICE_CATEGORY_LABEL, centsToInput } from "@/lib/pricing";

/**
 * One form for hiring and for editing.
 *
 * Pay is three things in order of how often a shop needs them: one rate for the
 * person (blank = the shop default), an hourly minimum, and — behind a
 * disclosure, because most shops never open it — a rate for one category or one
 * service. A blank box is not a rate of zero, it is the absence of an exception,
 * which is what makes the fallback chain work without a switch anywhere.
 */

const inputClass =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm ";

export interface StationOption {
  id: string;
  name: string;
}

export interface ServiceOption {
  id: string;
  name: string;
  category: ServiceCategory;
}

export interface StaffFormValues {
  id?: string;
  name: string;
  email: string;
  roles: StaffRole[];
  defaultStationId: string | null;
  isActive: boolean;
  commissionPercent: number | null;
  hourlyRateCents: number | null;
  /** Exceptions only: percent by category and by service. */
  ratesByCategory: Partial<Record<ServiceCategory, number>>;
  ratesByService: Record<string, number>;
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
  services,
}: {
  action: (formData: FormData) => Promise<void>;
  initial: StaffFormValues;
  submitLabel: string;
  defaultCommission: number;
  stations: StationOption[];
  services: ServiceOption[];
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
          <label className="text-sm">
            <span className="block font-medium text-stone-700 mb-1">Hourly minimum</span>
            <input
              name="hourlyRate"
              inputMode="decimal"
              defaultValue={centsToInput(initial.hourlyRateCents)}
              placeholder="None"
              className={inputClass}
            />
            <span className="block text-xs text-stone-400 mt-1">
              A quiet week earning less commission than the hours they were scheduled is lifted to
              this. Leave blank and commission stands on its own.
            </span>
          </label>
        </div>

        {/* Secondary by design: a shop paying one rate never opens this. */}
        <details className="disclosure rounded-lg border border-stone-200 px-3 py-2">
          <summary className="text-sm font-medium text-stone-700">
            Different rates by service
          </summary>

          <div className="mt-3 space-y-4">
            <div>
              <p className="text-xs font-semibold text-stone-500 mb-1">By category</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.values(ServiceCategory).map((category) => (
                  <label key={category} className="text-xs">
                    <span className="block text-stone-500 mb-1">
                      {SERVICE_CATEGORY_LABEL[category]}
                    </span>
                    <input
                      name={`rateCategory_${category}`}
                      inputMode="decimal"
                      defaultValue={initial.ratesByCategory[category] ?? ""}
                      placeholder="%"
                      className="w-full border border-stone-200 rounded-lg px-2 py-1.5 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>

            {services.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-stone-500 mb-1">
                  By service — beats the category above
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {services.map((service) => (
                    <label key={service.id} className="flex items-center gap-2 text-xs">
                      <input
                        name={`rateService_${service.id}`}
                        inputMode="decimal"
                        defaultValue={initial.ratesByService[service.id] ?? ""}
                        placeholder="%"
                        aria-label={`Commission for ${service.name}`}
                        className="w-16 border border-stone-200 rounded-lg px-2 py-1.5 text-sm"
                      />
                      <span className="text-stone-600">{service.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-stone-400">
              A blank box is no rate at all, not zero: the service&apos;s rate is used, then its
              category&apos;s, then this person&apos;s, then the shop&apos;s {defaultCommission}%.
            </p>
          </div>
        </details>

        <div className="text-sm">
          <span className="block font-medium text-stone-700 mb-1">Roles</span>
          <TagPicker
            name="roles"
            initialIds={initial.roles}
            options={Object.values(StaffRole).map((role) => ({
              id: role,
              label: ROLE_LABEL[role],
            }))}
            optionsLabel="Roles"
            emptyLabel="No roles yet"
            noun="role"
          />
          <span className="block text-xs text-stone-400 mt-1">
            Someone can hold several — a groomer who also baths, an admin who still works the
            storefront. Admin is what unlocks the admin panel.
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
