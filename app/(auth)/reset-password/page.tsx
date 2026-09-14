import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MIN_PASSWORD_LENGTH,
  consumePasswordReset,
  inspectResetToken,
} from "@/lib/password-reset";

export const metadata = { title: "Reset Password" };

export const dynamic = "force-dynamic";

const DEAD_LINK: Record<string, string> = {
  invalid: "That link is not one we recognise. Ask for a new one.",
  expired: "That link has expired. Ask for a new one and use it within the hour.",
  used: "That link has already been used. If it was not you, ask for another one now.",
};

const FORM_ERROR: Record<string, string> = {
  ...DEAD_LINK,
  weak: `Pick a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  mismatch: "Those two passwords do not match.",
};

async function setNewPassword(formData: FormData) {
  "use server";

  const token = ((formData.get("token") as string | null) ?? "").trim();
  const password = (formData.get("password") as string | null) ?? "";
  const confirm = (formData.get("confirmPassword") as string | null) ?? "";

  // The annotation is on the *variable*, not the arrow: control-flow analysis
  // only treats a call as terminating when the identifier is explicitly typed.
  // Without it TypeScript lets execution fall past `back(...)` into the
  // success branch, where `result` is still possibly a failure.
  const back: (error: string) => never = (error) =>
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${error}`);

  if (password !== confirm) back("mismatch");

  const result = await consumePasswordReset(token, password);
  if (!result.ok) back(result.reason);

  // Straight to the sign-in they came from, with the right table preselected.
  redirect(`/login?type=${result.subject}&reset=1`);
}

export default async function ResetPasswordPage(props: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const token = (searchParams.token ?? "").trim();

  // Checked before the form is drawn: someone on a dead link should be told so
  // rather than typing a new password twice to find out.
  const state = token ? await inspectResetToken(token) : "invalid";

  if (state !== "ok") {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
          <h1 className="text-2xl font-black text-stone-900 mb-1">This link no longer works</h1>
          <p className="text-sm text-stone-600 mt-3">{DEAD_LINK[state]}</p>
          <Link
            href="/forgot-password"
            className="mt-6 block w-full bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 font-semibold py-2.5 rounded-lg text-center transition-colors"
          >
            Send me a new link
          </Link>
        </div>
      </div>
    );
  }

  const error = searchParams.error ? FORM_ERROR[searchParams.error] : null;

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
        <h1 className="text-2xl font-black text-stone-900 mb-1">Choose a new password</h1>
        <p className="text-sm text-stone-500 mb-6">
          At least {MIN_PASSWORD_LENGTH} characters. You&apos;ll be signed in with it straight away.
        </p>

        <form action={setNewPassword} className="space-y-3">
          <input type="hidden" name="token" value={token} />

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1">
              New password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "reset-error" : undefined}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "reset-error" : undefined}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {error && (
            <p id="reset-error" role="alert" className="text-red-600 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 font-semibold py-2.5 rounded-lg transition-colors"
          >
            Save new password
          </button>
        </form>
      </div>
    </div>
  );
}
