import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
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

  async function registerAction(formData: FormData) {
    "use server";

    const cfg = await getConfig();

    const firstName = (formData.get("firstName") as string | null)?.trim() ?? "";
    const lastName = (formData.get("lastName") as string | null)?.trim() ?? "";
    const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
    const phone = (formData.get("phone") as string | null)?.trim() || null;
    const password = (formData.get("password") as string | null) ?? "";
    const confirmPassword = (formData.get("confirmPassword") as string | null) ?? "";
    const waiverAccepted = formData.get("waiverAccepted") === "true";

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
    if (cfg.featureWaiverRequired && !waiverAccepted) {
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

    // Record waiver acceptance if required
    if (cfg.featureWaiverRequired && cfg.waiverVersion) {
      const reqHeaders = await headers();
      const ip =
        reqHeaders.get("x-forwarded-for")?.split(",")[0].trim() ??
        reqHeaders.get("x-real-ip") ??
        null;
      const userAgent = reqHeaders.get("user-agent") ?? null;

      await prisma.waiverAcceptance.create({
        data: {
          customerId: customer.id,
          waiverVersion: cfg.waiverVersion,
          ipAddress: ip,
          userAgent,
        },
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
      <RegisterForm
        action={registerAction}
        waiverRequired={config.featureWaiverRequired}
        waiverText={config.waiverText ?? null}
      />
    </Suspense>
  );
}
