import { StationRole } from "@prisma/client";
import StationForm from "../StationForm";
import { createStation } from "../actions";
import { PageShell } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Add Station" };

const ERRORS: Record<string, string> = {
  invalid_role: "Pick one of the listed roles.",
  invalid_grid: "Kennel units need at least one row and one kennel per row.",
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewStationPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <PageShell
      back={{ href: "/admin/stations", label: "Back to Stations" }}
      title="Add Station"
      subtitle="A station is any place a pet occupies — a groom table, a bath, or a bank of kennels."
    >

      {errorMessage && (
        <p className="border-t border-stone-100 bg-red-50 px-3 py-2 text-red-800 text-sm font-medium">
          {errorMessage}
        </p>
      )}

      <StationForm
        action={createStation}
        submitLabel="Create Station"
        initial={{
          allowedRoles: [],
          role: StationRole.GROOMER,
          isActive: true,
          kennelRows: 2,
          kennelColumns: 4,
        }}
      />
    </PageShell>
  );
}
