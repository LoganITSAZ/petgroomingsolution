"use server";

import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import { THEME_PRESETS, hexToRgbTriplet } from "@/lib/themes";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveAppearance(formData: FormData): Promise<void> {
  await requireManager();

  const preset = ((formData.get("themePreset") as string | null) ?? "default").trim();
  if (!THEME_PRESETS.some((theme) => theme.id === preset)) {
    redirect("/admin/appearance?error=unknown_preset");
  }

  const brandColorRaw = ((formData.get("themeBrandColor") as string | null) ?? "").trim();
  const useCustomColor = formData.get("useCustomColor") === "on";
  if (useCustomColor && brandColorRaw && !hexToRgbTriplet(brandColorRaw)) {
    redirect("/admin/appearance?error=bad_color");
  }

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: {
      themePreset: preset,
      themeAutoSeasonal: formData.get("themeAutoSeasonal") === "on",
      themeBrandColor: useCustomColor && brandColorRaw ? brandColorRaw : null,
      themeBannerText: ((formData.get("themeBannerText") as string | null) ?? "").trim() || null,
    },
  });

  // The public pages read the theme on every request, but the admin preview
  // and any cached shell need refreshing.
  revalidatePath("/", "layout");
  revalidatePath("/admin/appearance");
  redirect("/admin/appearance?saved=1");
}
