"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Refresh the server snapshot without interrupting a staff member using a form. */
export function DashboardRefresh({ updatedAt }: { updatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || document.activeElement?.closest("form")) return;
      startTransition(() => router.refresh());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}
    title={`Snapshot: ${updatedAt}. Refreshes every minute while visible.`}
    className="rounded-lg border border-well-line bg-surface px-3 py-2 text-xs font-semibold text-muted disabled:opacity-60">
    {pending ? "Refreshing…" : "↻ Refresh · every 60s"}
  </button>;
}
