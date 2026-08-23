import { redirect } from "next/navigation";

// Customers and pets are searched together at /staff/directory.
// This path stays as a redirect so existing links and bookmarks keep working.
export default function LegacyCustomersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q?.trim();
  redirect(q ? `/staff/directory?q=${encodeURIComponent(q)}` : "/staff/directory");
}
