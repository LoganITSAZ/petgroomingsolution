import { redirect } from "next/navigation";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Pets" };

// Customers and pets are searched together at /staff/customers.
// This path stays as a redirect so existing links and bookmarks keep working.
export default function LegacyPetsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q?.trim();
  redirect(q ? `/staff/customers?q=${encodeURIComponent(q)}` : "/staff/customers");
}
