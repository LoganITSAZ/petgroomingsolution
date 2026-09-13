import { getConfig } from "@/lib/config";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const config = await getConfig();

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-black text-stone-900">
            <span aria-hidden="true">🐾</span> {config.shopName}
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
