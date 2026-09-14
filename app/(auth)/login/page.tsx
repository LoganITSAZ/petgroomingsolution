"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const defaultType = params.get("type") === "staff" ? "staff" : "customer";
  const justReset = params.get("reset") === "1";

  const [userType, setUserType] = useState<"customer" | "staff">(defaultType);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", {
      email,
      password,
      role: userType,
      redirect: false,
    });
    setLoading(false);
    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }
    const callback = params.get("callbackUrl");
    router.push(userType === "staff" && callback?.startsWith("/station/") && !callback.includes("\\")
      ? callback : userType === "staff" ? "/staff" : "/portal");
  }

  return (
    <div className="liquid-shell min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
        <h1 className="text-2xl font-black text-stone-900 mb-1">Sign in</h1>
        {justReset && (
          <p role="status" className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            Your password has been changed. Sign in with the new one.
          </p>
        )}
        {/* Toggle customer / staff */}
        <div className="flex rounded-lg border border-stone-200 p-1 mb-6 gap-1">
          {(["customer", "staff"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setUserType(t)}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors capitalize ${
                userType === t
                  ? "bg-brand-600 text-brand-on-600"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {t === "customer" ? "Pet Owner" : "Staff"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "login-error" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          {error && (
            <p id="login-error" role="alert" className="text-red-600 text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-brand-on-600 hover:text-brand-on-700 font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-sm text-stone-500 mt-6">
          <Link
            href={`/forgot-password?type=${userType}`}
            className="text-brand-text hover:underline font-medium"
          >
            Forgot your password?
          </Link>
        </p>

        {userType === "customer" && (
          <p className="text-center text-sm text-stone-500 mt-2">
            New here?{" "}
            <Link href="/register" className="text-brand-text hover:underline font-medium">
              Create an account
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="liquid-shell min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="text-stone-400 text-sm">Loading…</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
