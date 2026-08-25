import Link from "next/link";
import { StationRole } from "@prisma/client";
import StationForm from "../StationForm";
import { createStation } from "../actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "New station" };

const ERRORS: Record<string, string> = {
  name_required: "A station needs a name.",
  invalid_role: "Pick one of the listed roles.",
  invalid_grid: "Kennel units need at least one row and one kennel per row.",
};

interface PageProps {
  searchParams: { error?: string };
}

export default function NewStationPage({ searchParams }: PageProps) {
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <div className="space-y-3">
      <div>
        <Link
          href="/admin/stations"
          className="text-sm text-stone-500 hover:text-stone-800 transition-colors"
        >
          ← Back to Stations
        </Link>
        <h1 className="text-xl font-bold text-stone-900 mt-2">Add Station</h1>
        <p className="text-sm text-stone-500 mt-1">
          A station is any place a pet occupies — a groom table, a bath, or a bank of kennels.
        </p>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-800 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      <StationForm
        action={createStation}
        submitLabel="Create Station"
        initial={{
          name: "",
          allowedRoles: [],
          role: StationRole.GROOMER,
          isActive: true,
          kennelRows: 2,
          kennelColumns: 4,
        }}
      />
    </div>
  );
}
