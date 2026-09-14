import Link from "next/link";
import { redirect } from "next/navigation";
import { requestPasswordReset, type ResetSubject } from "@/lib/password-reset";

export const metadata = { title: "Forgot Password" };

// Reads the shop's config through the email it sends, so it must not be
// prerendered — same rule as every other config-reading page.
export const dynamic = "force-dynamic";

async function sendResetLink(formData: FormData) {
  "use server";

  const email = ((formData.get("email") as string | null) ?? "").trim();
  const subject: ResetSubject = formData.get("type") === "staff" ? "staff" : "customer";

  // Always the same answer, whether or not the address is on file: a form that
  // says "no such account" is a way to ask who the shop's customers are.
  await requestPasswordReset(email, subject);

  redirect(`/forgot-password?sent=1&type=${subject}`);
}

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<{ sent?: string; type?: string }>;
}) {
  const searchParams = await props.searchParams;
  const userType: ResetSubject = searchParams.type === "staff" ? "staff" : "customer";
  const sent = searchParams.sent === "1";

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
        <h1 className="text-2xl font-black text-stone-900 mb-1">Forgot your password?</h1>

        {sent ? (
          <>
            <p className="text-sm text-stone-600 mt-4">
              If that address has an account, a link to choose a new password is on its way. It
              works once and expires in an hour.
            </p>
            <p className="text-sm text-stone-500 mt-3">
              Nothing arrived? Check the spam folder, or ask again — the newest link is the one that
              works.
            </p>
            <Link
              href={`/login?type=${userType}`}
              className="mt-6 block text-center text-sm text-brand-text hover:underline font-medium"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-500 mb-6">
              Give us the address on the account and we&apos;ll send a link to set a new password.
            </p>

            <form action={sendResetLink} className="space-y-3">
              {/* Two sign-in tables, so the form has to say which one to look in. */}
              <fieldset>
                <legend className="block text-sm font-medium text-stone-700 mb-1">
                  Which account?
                </legend>
                <div className="flex rounded-lg border border-stone-200 p-1 gap-1">
                  {(["customer", "staff"] as const).map((value) => (
                    <label
                      key={value}
                      className="flex-1 has-[:checked]:bg-brand-600 has-[:checked]:text-brand-on-600
                                 text-stone-500 hover:text-stone-800 rounded-md py-2 text-center
                                 text-sm font-semibold cursor-pointer transition-colors
                                 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400"
                    >
                      <input
                        type="radio"
                        name="type"
                        value={value}
                        defaultChecked={userType === value}
                        className="sr-only"
                      />
                      {value === "customer" ? "Pet Owner" : "Staff"}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 font-semibold py-2.5 rounded-lg transition-colors"
              >
                Send the link
              </button>
            </form>

            <Link
              href={`/login?type=${userType}`}
              className="mt-6 block text-center text-sm text-stone-500 hover:text-stone-800"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
