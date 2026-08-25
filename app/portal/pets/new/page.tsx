import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Add a pet" };

export default async function NewPetPage() {
  const session = await auth();
  if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");

  async function createPet(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");
    const customerId = session.user.id;

    const name = formData.get("name") as string;
    const species = formData.get("species") as string;
    const breed = formData.get("breed") as string | null;
    const dateOfBirthRaw = formData.get("dateOfBirth") as string | null;
    const weightLbsRaw = formData.get("weightLbs") as string | null;
    const coatType = formData.get("coatType") as string | null;
    const groomingNotes = formData.get("groomingNotes") as string | null;

    if (!name?.trim() || !species) return;

    await prisma.pet.create({
      data: {
        customerId,
        name: name.trim(),
        species: species as "DOG" | "CAT" | "OTHER",
        breed: breed?.trim() || null,
        dateOfBirth: dateOfBirthRaw ? new Date(dateOfBirthRaw) : null,
        weightLbs: weightLbsRaw ? parseFloat(weightLbsRaw) : null,
        coatType: (coatType as "SHORT" | "MEDIUM" | "LONG" | "DOUBLE" | "CURLY" | "WIRE" | "HAIRLESS" | null) || null,
        groomingNotes: groomingNotes?.trim() || null,
      },
    });

    redirect("/portal/pets");
  }

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="mb-3">
        <Link href="/portal/pets" className="text-sm text-stone-400 hover:text-stone-600 mb-2 inline-block">
          ← Back to My Pets
        </Link>
        <h1 className="text-xl font-black text-stone-900">Add a Pet</h1>
        <p className="text-stone-500 text-sm mt-0.5">Tell us about your furry family member.</p>
      </div>

      <form action={createPet} className="bg-white border border-stone-200 rounded-xl p-4 space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="name" className="block text-sm font-semibold text-stone-700 mb-1">
            Pet Name <span className="text-red-700">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="e.g. Biscuit"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* Species */}
        <div>
          <label htmlFor="species" className="block text-sm font-semibold text-stone-700 mb-1">
            Species <span className="text-red-700">*</span>
          </label>
          <select
            id="species"
            name="species"
            required
            defaultValue=""
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="" disabled>Select species…</option>
            <option value="DOG">Dog 🐶</option>
            <option value="CAT">Cat 🐱</option>
            <option value="OTHER">Other 🐾</option>
          </select>
        </div>

        {/* Breed */}
        <div>
          <label htmlFor="breed" className="block text-sm font-semibold text-stone-700 mb-1">
            Breed <span className="text-stone-400 font-normal">(optional)</span>
          </label>
          <input
            id="breed"
            name="breed"
            type="text"
            placeholder="e.g. Golden Retriever"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* Date of Birth + Weight */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="dateOfBirth" className="block text-sm font-semibold text-stone-700 mb-1">
              Date of Birth <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label htmlFor="weightLbs" className="block text-sm font-semibold text-stone-700 mb-1">
              Weight (lbs) <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              id="weightLbs"
              name="weightLbs"
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 35"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>

        {/* Coat Type */}
        <div>
          <label htmlFor="coatType" className="block text-sm font-semibold text-stone-700 mb-1">
            Coat Type <span className="text-stone-400 font-normal">(optional)</span>
          </label>
          <select
            id="coatType"
            name="coatType"
            defaultValue=""
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">Select coat type…</option>
            <option value="SHORT">Short</option>
            <option value="MEDIUM">Medium</option>
            <option value="LONG">Long</option>
            <option value="DOUBLE">Double</option>
            <option value="CURLY">Curly</option>
            <option value="WIRE">Wire</option>
            <option value="HAIRLESS">Hairless</option>
          </select>
        </div>

        {/* Grooming Notes */}
        <div>
          <label htmlFor="groomingNotes" className="block text-sm font-semibold text-stone-700 mb-1">
            Grooming Notes <span className="text-stone-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="groomingNotes"
            name="groomingNotes"
            rows={3}
            placeholder="Standing instructions for every visit, e.g. 'trim ears short, sensitive around paws'"
            className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Add Pet
          </button>
          <Link
            href="/portal/pets"
            className="text-sm text-stone-500 hover:text-stone-700 font-medium"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
