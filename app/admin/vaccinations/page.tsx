import { redirect } from "next/navigation";

/** Folded into Shop Settings. Kept so an old link still lands somewhere. */
export default function VaccinationsPage() {
  redirect("/admin/settings#vaccinations");
}
