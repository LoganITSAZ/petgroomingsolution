"use client";

import { useState } from "react";
import { StaffPresence } from "@prisma/client";
import { PRESENCE_CLASS, PRESENCE_LABEL, SETTABLE_PRESENCE } from "@/lib/presence";

/**
 * The one control every groomer touches all day: am I ready, stepping out, on
 * break, or done. Kept in the sidebar so it is never more than one tap away.
 */
export default function PresenceSwitcher({
  action,
  current,
  returnTo,
}: {
  action: (formData: FormData) => Promise<void>;
  current: StaffPresence;
  returnTo: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`w-full text-left text-xs font-bold px-2 py-1.5 rounded-lg ${PRESENCE_CLASS[current]}`}
      >
        {PRESENCE_LABEL[current]}
        <span className="float-right opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-full bg-white rounded-lg shadow-xl border border-stone-200 overflow-hidden z-50">
          {SETTABLE_PRESENCE.map((state) => (
            <form key={state} action={action}>
              <input type="hidden" name="presence" value={state} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                onClick={() => setOpen(false)}
                className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-stone-50 ${
                  state === current ? "text-stone-900" : "text-stone-600"
                }`}
              >
                {PRESENCE_LABEL[state]}
                {state === current && <span className="float-right text-stone-400">now</span>}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
