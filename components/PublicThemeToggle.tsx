"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Light/dark for the public site.
 *
 * Staff, customers and admins carry a `themePreference` column, but the shop's
 * website is read by people who have never signed in, so this is the visitor's
 * own switch and it lives in their browser. The default is the one their
 * device already asked for — `prefers-color-scheme` is a stated accessibility
 * preference, not a hint — and localStorage only records a deliberate override.
 *
 * The class goes on `#public-root` rather than <html>: the back office paints
 * its own dark mode from the signed-in user's column and must not be moved by
 * a visitor's choice on the front of the site.
 */
export const THEME_STORAGE_KEY = "publicTheme";

/**
 * Runs before first paint, inlined by the public layout. Reading the stored
 * choice after hydration would show a white page first, which is the flash
 * the switch exists to avoid.
 */
export const NO_FLASH_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;document.getElementById("public-root").classList.toggle("dark",d);}catch(e){}})();`;

function apply(dark: boolean) {
  document.getElementById("public-root")?.classList.toggle("dark", dark);
}

/**
 * The visitor's choice is an external store, not React state: it lives in
 * localStorage and in the device's own `prefers-color-scheme`, both of which
 * change without React asking. `useSyncExternalStore` is what reads one —
 * settling it in an effect instead means a setState on every mount.
 */
const listeners = new Set<() => void>();

/** Set when this page toggles, so a browser that refuses the write still holds. */
let localChoice: boolean | null = null;

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    media.removeEventListener("change", onStoreChange);
  };
}

function readDark(): boolean {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Storage can be blocked outright; fall through to the choice held here.
  }
  if (stored) return stored === "dark";
  // No deliberate override, so follow the device — someone whose phone dims at
  // sunset expects the site to come with it.
  return localChoice ?? window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function PublicThemeToggle({ className = "" }: { className?: string }) {
  // The server cannot know the visitor's choice, so it renders the light
  // label and the store corrects it. The icons are swapped by CSS off the same
  // class the pre-paint script sets, so nothing visible waits for hydration.
  const dark = useSyncExternalStore(subscribe, readDark, () => false);

    // Re-applied rather than merely read: the pre-paint script only runs on a
    // hard load. Arriving from elsewhere in the app inserts that script into a
    // live document, where it never executes.
  useEffect(() => {
    apply(dark);
  }, [dark]);

  function toggle() {
    localChoice = !dark;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, localChoice ? "dark" : "light");
    } catch {
      // Private browsing refuses writes; the choice still holds for this page.
    }
    for (const listener of listeners) listener();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface/60 text-muted transition hover:border-brand-500 hover:text-brand-text ${className}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 dark:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="hidden h-4 w-4 dark:block" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    </button>
  );
}
