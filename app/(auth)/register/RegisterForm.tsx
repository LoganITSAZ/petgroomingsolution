"use client";

import { useState, useRef, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

interface RegisterFormProps {
  action: (formData: FormData) => Promise<void>;
  waiverRequired: boolean;
  waiverText: string | null;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: "Please fill in all required fields.",
  invalid_email: "Please enter a valid email address.",
  password_too_short: "Password must be at least 8 characters.",
  password_mismatch: "Passwords do not match.",
  waiver_required: "You must accept the waiver to continue.",
  email_taken: "An account with that email already exists.",
};

export default function RegisterForm({
  action,
  waiverRequired,
  waiverText,
}: RegisterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const serverError = searchParams.get("error");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const waiverBoxRef = useRef<HTMLDivElement>(null);

  function validateClient(): boolean {
    const errors: Record<string, string> = {};
    if (!firstName.trim()) errors.firstName = "First name is required.";
    if (!lastName.trim()) errors.lastName = "Last name is required.";
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = "Enter a valid email address.";
    if (password.length < 8)
      errors.password = "Password must be at least 8 characters.";
    if (password !== confirmPassword)
      errors.confirmPassword = "Passwords do not match.";
    if (waiverRequired && !waiverAccepted)
      errors.waiver = "You must accept the waiver to continue.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateClient()) return;

    const fd = new FormData();
    fd.set("firstName", firstName);
    fd.set("lastName", lastName);
    fd.set("email", email);
    fd.set("phone", phone);
    fd.set("password", password);
    fd.set("confirmPassword", confirmPassword);
    fd.set("waiverAccepted", String(waiverAccepted));

    startTransition(async () => {
      await action(fd);
      // If action didn't redirect (shouldn't happen), sign in and push to portal
      const result = await signIn("credentials", {
        email,
        password,
        role: "customer",
        redirect: false,
      });
      if (!result?.error) {
        router.push("/portal");
      } else {
        router.push("/login?registered=1");
      }
    });
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
        <h1 className="text-2xl font-black text-stone-900 mb-1">Create account</h1>
        {serverError && ERROR_MESSAGES[serverError] && (
          <p role="alert" className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            {ERROR_MESSAGES[serverError]}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-stone-700 mb-1">
                First name
              </label>
              <input
                id="firstName"
                name="firstName"
                autoComplete="given-name"
                type="text"
                required
                aria-invalid={Boolean(fieldErrors.firstName)}
                aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              {fieldErrors.firstName && (
                <p id="firstName-error" className="text-red-600 text-xs mt-1">{fieldErrors.firstName}</p>
              )}
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-stone-700 mb-1">
                Last name
              </label>
              <input
                id="lastName"
                name="lastName"
                autoComplete="family-name"
                type="text"
                required
                aria-invalid={Boolean(fieldErrors.lastName)}
                aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              {fieldErrors.lastName && (
                <p id="lastName-error" className="text-red-600 text-xs mt-1">{fieldErrors.lastName}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {fieldErrors.email && (
              <p id="email-error" className="text-red-600 text-xs mt-1">{fieldErrors.email}</p>
            )}
          </div>

          {/* Phone (optional) */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-stone-700 mb-1">
              Phone{" "}
              <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {fieldErrors.password && (
              <p id="password-error" className="text-red-600 text-xs mt-1">{fieldErrors.password}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-700 mb-1">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? "confirmPassword-error" : undefined}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {fieldErrors.confirmPassword && (
              <p id="confirmPassword-error" className="text-red-600 text-xs mt-1">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          {/* Waiver */}
          {waiverRequired && waiverText && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Liability Waiver
              </label>
              <div
                ref={waiverBoxRef}
                className="h-40 overflow-y-auto border border-stone-300 rounded-lg px-3 py-2 text-xs text-stone-600 bg-stone-50 whitespace-pre-wrap leading-relaxed"
              >
                {waiverText}
              </div>
              <label className="flex items-start gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waiverAccepted}
                  onChange={(e) => setWaiverAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-400"
                />
                <span className="text-sm text-stone-700">
                  I have read and agree to the liability waiver above.
                </span>
              </label>
              {fieldErrors.waiver && (
                <p className="text-red-600 text-xs mt-1">{fieldErrors.waiver}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-brand-on-600 hover:text-brand-on-700 font-semibold py-2.5 rounded-lg transition-colors"
          >
            {isPending ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-stone-500 mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-brand-text hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
