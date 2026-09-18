import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import { CoatType, Species, StaffRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCoatType, formatSpecies } from "@/lib/utils";
import { createCustomer } from "../actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "New Customer" };

const ERRORS: Record<string, string> = {
  photo_too_large: "Photos have to be 2 MB or smaller.",
  photo_bad_type: "Photos must be JPEG, PNG or WebP.",
  name_required: "Enter a first and last name.",
  email_required: "Enter a valid email address.",
  email_taken: "A customer already uses that email address.",
  weak_password: "Portal passwords must be at least 8 characters.",
  bad_weight: "Weight has to be a positive number.",
};

const fieldClass =
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 bg-white";

export default async function NewCustomerPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const groomers = await prisma.staff.findMany({
    where: { isActive: true, roles: { has: StaffRole.GROOMER } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <PageShell
      back={{ href: "/staff/customers", label: "Back to Customers" }}
      title="New Customer"
      className="max-w-2xl flex-none"
    >

      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {errorMessage}
        </p>
      )}

      <form action={createCustomer} encType="multipart/form-data">
        <PageSection bodyClassName="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">
                First name <span className="text-red-700">*</span>
              </span>
              <input name="firstName" required className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">
                Last name <span className="text-red-700">*</span>
              </span>
              <input name="lastName" required className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">
                Email <span className="text-red-700">*</span>
              </span>
              <input name="email" type="email" required className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Phone</span>
              <input name="phone" className={fieldClass} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="block text-stone-600 mb-1">Address</span>
              <input name="address" placeholder="123 Main St, Phoenix, AZ 85020" className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Groomer</span>
              <select name="preferredStaffId" defaultValue="" className={fieldClass}>
                <option value="">Decide at check-in</option>
                {groomers.map((groomer) => (
                  <option key={groomer.id} value={groomer.id}>
                    {groomer.name}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-stone-400 mt-1">
                Their appointments default to this person, and to that person&apos;s station.
              </span>
            </label>

            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Photo (optional)</span>
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                className="w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold hover:file:bg-stone-200"
              />
            </label>

            <label className="text-sm sm:col-span-2">
              <span className="block text-stone-600 mb-1">Portal password (optional)</span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                className={fieldClass}
              />
              <span className="block text-xs text-stone-400 mt-1">
                Leave blank if they are not signing in online. At least 8 characters otherwise.
              </span>
            </label>
          </div>
        </PageSection>

        <PageSection bodyClassName="space-y-3">
          <p className="text-xs font-bold text-stone-500 tracking-tight">
            Approved alternate (optional)
          </p>
          <p className="text-xs text-stone-400 -mt-2">
            Someone else the owner allows to drop off or collect their pet.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Name</span>
              <input name="altContactName" className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Phone</span>
              <input name="altContactPhone" className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Email</span>
              <input name="altContactEmail" type="email" className={fieldClass} />
            </label>
          </div>
        </PageSection>

        <PageSection bodyClassName="space-y-3">
          <p className="text-xs font-bold text-stone-500 tracking-tight">
            First pet (optional)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Pet name</span>
              <input name="petName" className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Species</span>
              <select name="petSpecies" defaultValue={Species.DOG} className={fieldClass}>
                {Object.values(Species).map((species) => (
                  <option key={species} value={species}>
                    {formatSpecies(species)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Breed</span>
              <input name="petBreed" className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Weight (lbs)</span>
              <input name="petWeightLbs" inputMode="decimal" className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Coat</span>
              <select name="petCoatType" defaultValue="" className={fieldClass}>
                <option value="">Not recorded</option>
                {Object.values(CoatType).map((coat) => (
                  <option key={coat} value={coat}>
                    {formatCoatType(coat)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Grooming notes</span>
              <input name="petGroomingNotes" className={fieldClass} />
            </label>
            <label className="text-sm">
              <span className="block text-stone-600 mb-1">Pet photo (optional)</span>
              <input
                type="file"
                name="petPhoto"
                accept="image/jpeg,image/png,image/webp"
                className="w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold hover:file:bg-stone-200"
              />
            </label>
          </div>
        </PageSection>

        <PageSection tone="muted" bodyClassName="flex justify-end gap-3">
          <Link
            href="/staff/customers"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold"
          >
            Create Customer
          </button>
        </PageSection>
      </form>
    </PageShell>
  );
}
