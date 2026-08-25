import Link from "next/link";
import { CoatType, Species, StaffRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatCoatType, formatSpecies } from "@/lib/utils";
import { createCustomer } from "../actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "New customer" };

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
  "w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const groomers = await prisma.staff.findMany({
    where: { isActive: true, roles: { hasSome: [StaffRole.GROOMER, StaffRole.BATHER] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <div className="max-w-2xl space-y-3">
      <Link
        href="/staff/customers"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800"
      >
        ← Back to Customers
      </Link>

      <h1 className="text-xl font-black text-stone-900">New Customer</h1>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-800 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      <form action={createCustomer} encType="multipart/form-data" className="space-y-3">
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
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
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">
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
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-stone-500 uppercase tracking-widest">
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
        </div>

        <div className="flex justify-end gap-3">
          <Link
            href="/staff/customers"
            className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold"
          >
            Create Customer
          </button>
        </div>
      </form>
    </div>
  );
}
