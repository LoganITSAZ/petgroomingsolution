"use client";

import { useState } from "react";

import { useModalDialog } from "./useModalDialog";

/**
 * Check-in, one step of the visit's workflow.
 *
 * Arrival and kennelling happen together at the counter, so the button opens a
 * dialog that asks the one question that matters at that moment: which
 * compartment is this pet going into?
 */

export interface KennelChoice {
  id: string;
  label: string;
  stationName: string;
  inside: number;
  capacity: number;
  /** True when the extra room comes from the pets inside sharing a home. */
  sharedHousehold: boolean;
}

export default function CheckInDialog({
  action,
  appointmentId,
  petName,
  ownerName,
  kennels,
  listQuery,
  needsKennel,
}: {
  action: (formData: FormData) => Promise<void>;
  appointmentId: string;
  petName: string;
  ownerName: string;
  kennels: KennelChoice[];
  listQuery: string;
  needsKennel: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useModalDialog(open, () => setOpen(false));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-amber-700 hover:text-amber-900"
      >
        Check in
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="check-in-title"
            tabIndex={-1}
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-4 text-left"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="check-in-title" className="text-base font-black text-stone-900">
                  Check in {petName}
                </h2>
                <p className="text-sm text-stone-500">{ownerName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-sm"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form action={action} className="mt-3 space-y-3">
              <input type="hidden" name="appointmentId" value={appointmentId} />
              <input type="hidden" name="listQuery" value={listQuery} />

              <label className="block text-sm">
                <span className="block font-semibold text-stone-700 mb-1">Kennel</span>
                <select
                  name="kennelId"
                  defaultValue=""
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="">
                    {needsKennel ? "Not yet — assign later" : "No kennel needed"}
                  </option>
                  {kennels.map((kennel) => (
                    <option key={kennel.id} value={kennel.id}>
                      {kennel.stationName} · {kennel.label}
                      {kennel.capacity > 1 && ` (${kennel.inside}/${kennel.capacity})`}
                      {kennel.sharedHousehold && " · same household"}
                    </option>
                  ))}
                </select>
                {kennels.length === 0 && (
                  <span className="block text-xs text-amber-700 mt-1">
                    Every compartment is full. The pet is still checked in.
                  </span>
                )}
                {needsKennel && kennels.length > 0 && (
                  <span className="block text-xs text-stone-400 mt-1">
                    This visit was booked expecting a kennel.
                  </span>
                )}
              </label>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-700 hover:bg-amber-800 text-white px-4 py-1.5 rounded-lg text-sm font-semibold"
                >
                  Check in
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
