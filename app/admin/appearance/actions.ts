"use server";

import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import { THEME_PRESETS } from "@/lib/themes";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveAppearance(formData: FormData): Promise<void> {
  await requireManager();

  const choices = formData.getAll("themeChoice");
  const choice = choices.length === 1 && typeof choices[0] === "string" ? choices[0] : "";
  const preset = choice.startsWith("template:") ? choice.slice("template:".length) : "default";
  if (choice !== "calendar" && choice !== "shop" &&
      !(choice.startsWith("template:") && THEME_PRESETS.some((theme) => theme.id === preset))) {
    redirect("/admin/appearance?error=unknown_preset");
  }

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: {
      themePreset: preset,
      themeAutoSeasonal: choice === "calendar",
      themeUseShopColors: choice === "shop",
    },
  });

  // The public pages read the theme on every request, but the admin preview
  // and any cached shell need refreshing.
  revalidatePath("/", "layout");
  revalidatePath("/admin/appearance");
  redirect("/admin/appearance?saved=1");
}
