"use client";

import { useEffect } from "react";

/**
 * The client half of ThemePreference.SYSTEM.
 *
 * LIGHT and DARK are settled on the server — the layout puts the class on its
 * own wrapper. SYSTEM cannot be: the server has no idea what the device is set
 * to, and guessing would flash the wrong theme before the correction.
 *
 * Both halves below are load-bearing, for different arrivals:
 *
 * - The inline script runs on a **hard load**, before first paint, so the page
 *   never appears in the wrong theme and then corrects itself.
 * - The effect covers a **soft navigation**. A script element React inserts
 *   into an already-live document does not execute — the tag is in the DOM and
 *   nothing runs — so arriving here from another page inside the app would
 *   otherwise leave the class unset and no listener attached.
 *
 * The listener matters as much as the initial read: a device that switches at
 * sunset takes the screen with it, with no reload and no visit to a profile.
 */
export default function SystemThemeScript({ rootId, nonce }: { rootId: string; nonce?: string }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.getElementById(rootId)?.classList.toggle("dark", media.matches);

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [rootId]);

  const script = `(function(){try{var m=matchMedia("(prefers-color-scheme: dark)");var r=document.getElementById(${JSON.stringify(
    rootId
  )});if(r)r.classList.toggle("dark",m.matches)}catch(e){}})();`;

  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: script }} />;
}
