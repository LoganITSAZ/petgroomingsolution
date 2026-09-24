import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { acceptDocuments, activeDocuments } from "@/lib/documents";
import { storeImageDataUrl } from "@/lib/photos";
import RegisterForm from "./RegisterForm";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Create account" };

// SystemConfig is edited at runtime from /admin, so these pages must not be
// baked at build time — a prerendered snapshot would freeze shop details,
// feature flags, and waiver text until the next deploy.
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const config = await getConfig();
  // Nothing to sign is a shop with no documents, not an empty section.
  const documents = config.featureWaiverRequired ? await activeDocuments() : [];

  async function registerAction(formData: FormData) {
    "use server";

    const cfg = await getConfig();

    const firstName = (formData.get("firstName") as string | null)?.trim() ?? "";
    const lastName = (formData.get("lastName") as string | null)?.trim() ?? "";
    const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
    const phone = (formData.get("phone") as string | null)?.trim() || null;
    const password = (formData.get("password") as string | null) ?? "";
    const confirmPassword = (formData.get("confirmPassword") as string | null) ?? "";
    const documentsAccepted = formData.get("documentsAccepted") === "true";

    // Validate
    if (!firstName || !lastName || !email || !password) {
      redirect("/register?error=missing_fields");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      redirect("/register?error=invalid_email");
    }
    if (password.length < 8) {
      redirect("/register?error=password_too_short");
    }
    if (password !== confirmPassword) {
      redirect("/register?error=password_mismatch");
    }
    // Re-derived here rather than trusted from the render: a server action is
    // its own endpoint.
    const required = cfg.featureWaiverRequired ? await activeDocuments() : [];
    if (required.length > 0 && !documentsAccepted) {
      redirect("/register?error=waiver_required");
    }

    // Check for existing account
    const existing = await prisma.customer.findUnique({ where: { email } });
    if (existing) {
      redirect("/register?error=email_taken");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const customer = await prisma.customer.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        passwordHash,
      },
    });

    // What they agreed to, one row each, with the signature they drew.
    if (required.length > 0) {
      const reqHeaders = await headers();
      const signature = await storeImageDataUrl(formData.get("signature"));
      await acceptDocuments(customer.id, required, {
        signedName: (formData.get("signedName") as string | null) ?? null,
        signaturePhotoId: signature && "id" in signature ? signature.id : null,
        ipAddress: reqHeaders.get("x-real-ip") ?? reqHeaders.get("x-forwarded-for"),
        userAgent: reqHeaders.get("user-agent"),
      });
    }

    redirect("/login?registered=1");
  }

  // RegisterForm reads useSearchParams, which needs a Suspense boundary above
  // it or the /register prerender fails at build time.
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="text-stone-400 text-sm">Loading…</div>
        </div>
      }
    >
      <RegisterForm action={registerAction} documents={documents} />
    </Suspense>
  );
}
