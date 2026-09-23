"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { contactSettings } from "@/lib/contact-form";
import { requireAdmin } from "@/lib/auth-guards";

export async function saveContactSettings(form: FormData) {
  "use server";
  await requireAdmin();
  const parsed = contactSettings.safeParse({
    contactFormEnabled: form.get("contactFormEnabled") === "on",
    contactRecipient: form.get("contactRecipient"),
    contactRequirePhone: form.get("contactRequirePhone") === "on",
    contactSuccessMessage: form.get("contactSuccessMessage"),
  });
  if (!parsed.success) redirect(`/admin/contact?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  await prisma.systemConfig.update({ where: { id: "global" }, data: parsed.data });
  revalidatePath("/contact");
  revalidatePath("/admin/contact");
  redirect("/admin/contact?saved=1");
}

