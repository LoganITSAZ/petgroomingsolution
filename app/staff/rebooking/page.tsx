import { redirect } from "next/navigation";

/**
 * The call list is a group of the appointments board now — the only screen
 * that books anything. Kept as a redirect: groomers have this on their phones.
 */
export default function RebookingRedirect() {
  redirect("/staff/appointments?group=rebook");
}
