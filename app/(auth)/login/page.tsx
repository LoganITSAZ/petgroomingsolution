"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const defaultType = params.get("type") === "staff" ? "staff" : "customer";

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
    router.push(userType === "staff" ? "/staff" : "/portal");
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-stone-200 p-8">
        <h1 className="text-2xl font-black text-stone-900 mb-1">Sign in</h1>
        <p className="text-stone-500 mb-6 text-sm">🐾 Gentle Groomer</p>

        {/* Toggle customer / staff */}
        <div className="flex rounded-lg border border-stone-200 p-1 mb-6 gap-1">
          {(["customer", "staff"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setUserType(t)}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors capitalize ${
                userType === t
                  ? "bg-brand-600 text-white"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {t === "customer" ? "Pet Owner" : "Staff"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {userType === "customer" && (
          <p className="text-center text-sm text-stone-500 mt-6">
            New here?{" "}
            <Link href="/register" className="text-brand-600 hover:underline font-medium">
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
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="text-stone-400 text-sm">Loading…</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
