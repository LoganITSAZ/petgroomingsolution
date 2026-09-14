import { redirect } from "next/navigation";

export default async function WaiverPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["saved", "error", "version", "bumped", "restored"]) {
    const value = params[key];
    if (typeof value === "string") {
      query.set(key === "saved" ? "waiverSaved" : key === "error" ? "waiverError" : key, value);
    }
  }
  redirect(`/admin/settings${query.size ? `?${query}` : ""}#liability-waiver`);
}
