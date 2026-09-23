"use server";

import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/auth-guards";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PAGE_LABELS, PUBLIC_PATHS, type PublicPath } from "@/lib/seo";
import { deletePhotoIfUnused, storePhoto } from "@/lib/photos";

function done(params: string): never {
  revalidatePath("/admin/marketing");
  revalidatePath("/staff/services");
  revalidatePath("/staff");
  revalidatePath("/services");
  revalidatePath("/");
  redirect(`/admin/marketing${params}`);
}

/** Datetime-local strings are wall clock; empty means an open bound. */
function parseWhen(value: FormDataEntryValue | null): Date | null | "invalid" {
  const raw = ((value as string | null) ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

export async function savePromotion(formData: FormData): Promise<void> {
  await requireManager();

  const id = ((formData.get("id") as string | null) ?? "").trim();
  const title = ((formData.get("title") as string | null) ?? "").trim();
  const body = ((formData.get("body") as string | null) ?? "").trim();
  const serviceId = ((formData.get("serviceId") as string | null) ?? "").trim();

  if (!title) done("?error=title_required");
  if (!body) done("?error=body_required");
  if (!serviceId) done("?error=service_required");

  // A promotion advertises a specific service, so it has to point at a live one.
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) done("?error=service_missing");

  const startsAt = parseWhen(formData.get("startsAt"));
  const endsAt = parseWhen(formData.get("endsAt"));
  if (startsAt === "invalid" || endsAt === "invalid") done("?error=invalid_dates");
  if (startsAt && endsAt && endsAt <= startsAt) done("?error=backwards_window");

  const data = {
    serviceId,
    title,
    body,
    code: ((formData.get("code") as string | null) ?? "").trim() || null,
    startsAt,
    endsAt,
    isActive: formData.get("isActive") === "on",
    showOnSite: formData.get("showOnSite") === "on",
    showToStaff: formData.get("showToStaff") === "on",
    sortOrder: Math.round(Number((formData.get("sortOrder") as string | null) ?? "0") || 0),
  };

  if (id) {
    await prisma.promotion.update({ where: { id }, data });
  } else {
    await prisma.promotion.create({ data });
  }
  done(`?saved=${encodeURIComponent(title)}`);
}

export async function deletePromotion(formData: FormData): Promise<void> {
  await requireManager();
  const id = (formData.get("id") as string | null) ?? "";
  await prisma.promotion.delete({ where: { id } });
  done("?deleted=1");
}

/* ---------------------------------------------------------------- search --- */

/**
 * Search and sharing. Only the numbers and words that cannot be derived live
 * here: the service radius, the verification token, the keywords tag and the
 * line on the social card. Everything else a search engine is told — titles,
 * the business markup, the offers, the hours — is read from shop identity and
 * the catalog at request time.
 */
export async function saveSearchSettings(formData: FormData): Promise<void> {
  await requireManager();
  const text = (name: string) => ((formData.get(name) as string | null) ?? "").trim() || null;

  await prisma.systemConfig.update({
    where: { id: "global" },
    data: {
      // A radius of nought serves nobody; lib/seo.ts floors it too, because a
      // mis-saved value must not read as "we do not come to you".
      serviceAreaMiles: Math.max(1, Math.round(Number(formData.get("serviceAreaMiles") ?? 20) || 20)),
      seoGoogleVerification: text("seoGoogleVerification"),
      seoKeywords: text("seoKeywords"),
      seoSocialTagline: text("seoSocialTagline"),
    },
  });
  done("?saved=search%20settings#search");
}

/**
 * One public page's own words and share image.
 *
 * A blank field is not an empty tag — it deletes the override and the page
 * goes back to the line derived from the shop's name, city and radius. The row
 * is removed entirely once nothing on it is set, so an untouched page has no
 * row at all.
 */
export async function savePageSeo(formData: FormData): Promise<void> {
  await requireManager();
  const path = ((formData.get("path") as string | null) ?? "") as PublicPath;
  if (!PUBLIC_PATHS.includes(path)) done("?error=unknown_page#search");

  const text = (name: string) => ((formData.get(name) as string | null) ?? "").trim() || null;
  const existing = await prisma.seoPage.findUnique({ where: { path } });

  let photoId = existing?.photoId ?? null;
  const stored = await storePhoto(formData.get("image"));
  if (stored && "error" in stored) done(`?error=${stored.error}#search`);
  if (stored) photoId = stored.id;
  if (formData.get("removeImage") === "on") photoId = null;

  const data = { title: text("title"), description: text("description"), keywords: text("keywords"), photoId };
  if (!data.title && !data.description && !data.keywords && !data.photoId) {
    if (existing) await prisma.seoPage.delete({ where: { path } });
  } else {
    await prisma.seoPage.upsert({ where: { path }, create: { path, ...data }, update: data });
  }
  // The old image is only rubbish once the row no longer points at it.
  if (existing?.photoId && existing.photoId !== photoId) await deletePhotoIfUnused(existing.photoId);

  revalidatePath("/about");
  revalidatePath("/contact");
  done(`?saved=${encodeURIComponent(PAGE_LABELS[path])}#search`);
}

/* ------------------------------------------------------------------- faq --- */

export async function saveFaqItem(formData: FormData): Promise<void> {
  await requireManager();
  const id = ((formData.get("id") as string | null) ?? "").trim();
  const question = ((formData.get("question") as string | null) ?? "").trim();
  const answer = ((formData.get("answer") as string | null) ?? "").trim();
  if (!question) done("?error=question_required#faq");
  if (!answer) done("?error=answer_required#faq");

  const data = {
    question,
    answer,
    sortOrder: Math.round(Number((formData.get("sortOrder") as string | null) ?? "0") || 0),
    isActive: formData.get("isActive") === "on",
  };
  if (id) {
    await prisma.faqItem.update({ where: { id }, data });
  } else {
    await prisma.faqItem.create({ data });
  }
  done(`?saved=${encodeURIComponent(question)}#faq`);
}

export async function deleteFaqItem(formData: FormData): Promise<void> {
  await requireManager();
  await prisma.faqItem.delete({ where: { id: (formData.get("id") as string | null) ?? "" } });
  done("?deleted=1#faq");
}
