"use server";

import { prisma } from "@/lib/prisma";
import { requireFeature, requireManager } from "@/lib/auth-guards";
import { readRating } from "@/lib/testimonials";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function done(params: string): never {
  revalidatePath("/admin/testimonials");
  // The home page reads the published ones, so it goes stale on every edit.
  revalidatePath("/");
  redirect(`/admin/testimonials${params}`);
}

/**
 * Every action here is a manager's, and every one of them is also gated on the
 * feature: a server action is its own endpoint, so hiding the screen is not a
 * gate. Approving a quote while the feature is off would publish it the moment
 * somebody switched the feature on, which is not what the click meant.
 */
async function guard(): Promise<void> {
  await requireManager();
  await requireFeature("featureTestimonials");
}

export async function saveTestimonial(formData: FormData): Promise<void> {
  await guard();

  const id = ((formData.get("id") as string | null) ?? "").trim();
  const quote = ((formData.get("quote") as string | null) ?? "").trim();
  const author = ((formData.get("author") as string | null) ?? "").trim();

  if (!quote) done("?error=quote_required");
  if (!author) done("?error=author_required");

  const data = {
    quote,
    author,
    petName: ((formData.get("petName") as string | null) ?? "").trim() || null,
    rating: readRating(formData.get("rating")),
    isActive: formData.get("isActive") === "on",
    sortOrder: Math.round(Number((formData.get("sortOrder") as string | null) ?? "0") || 0),
  };

  if (id) {
    await prisma.testimonial.update({ where: { id }, data });
  } else {
    // The shop writing one down has read it by definition — the queue is for
    // what customers send in.
    await prisma.testimonial.create({ data: { ...data, approvedAt: new Date() } });
  }
  done(`?saved=${encodeURIComponent(author)}`);
}

/** Read and published. Edits made in the queue form are saved with it. */
export async function approveTestimonial(formData: FormData): Promise<void> {
  await guard();
  const id = (formData.get("id") as string | null) ?? "";
  await prisma.testimonial.update({
    where: { id },
    data: { approvedAt: new Date(), isActive: true },
  });
  done("?approved=1");
}

/**
 * Back to the queue. Not a delete: a manager who clears an approval has
 * decided something about the quote, and the customer's words are still
 * theirs — the shop can approve it later without asking them to write it
 * again.
 */
export async function unapproveTestimonial(formData: FormData): Promise<void> {
  await guard();
  const id = (formData.get("id") as string | null) ?? "";
  await prisma.testimonial.update({ where: { id }, data: { approvedAt: null } });
  done("?queued=1");
}

export async function deleteTestimonial(formData: FormData): Promise<void> {
  await guard();
  const id = (formData.get("id") as string | null) ?? "";
  await prisma.testimonial.delete({ where: { id } });
  done("?deleted=1");
}
