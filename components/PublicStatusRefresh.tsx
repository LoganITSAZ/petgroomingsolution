"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Refresh the shared header and page together, including settings changed by staff. */
export default function PublicStatusRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Read through a ref: `pending` flips on every refresh, and as a dependency it
  // would tear down and rebuild the interval each time, restarting the 30s clock.
  const busy = useRef(false);
  useEffect(() => { busy.current = pending; }, [pending]);

  useEffect(() => {
    let lastRefresh = 0;
    const refresh = () => {
      if (busy.current || document.visibilityState !== "visible" || Date.now() - lastRefresh < 1000) return;
      lastRefresh = Date.now();
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
