"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth-guards";
import { MAX_SNOOZE_DAYS, snoozeInsight } from "@/lib/insight-decisions";

/**
 * Put a shop insight away for a few days.
 *
 * `requireManager()` rather than `requireStaff()`: the observations this hides
 * are the ones the analytics screen carries, and that screen is already a
 * manager's. A server action is its own endpoint — middleware and the layout's
 * session check do not run for it.
 */
export async function snoozeShopInsight(formData: FormData): Promise<void> {
  const staffId = await requireManager();

  const insightId = String(formData.get("insightId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const days = Number(formData.get("days"));
  // Everything here is posted, so nothing here is trusted. The write clamps the
  // day count too; this rejects the shapes that are not a snooze at all.
  if (!insightId || !Number.isFinite(days) || days < 1 || days > MAX_SNOOZE_DAYS) return;

  await snoozeInsight({
    insightId,
    title: title || insightId,
    days,
    staffId,
  });

  revalidatePath("/staff/analytics");
  revalidatePath("/staff");
}
