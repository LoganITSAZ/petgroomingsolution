"use client";

import { useState } from "react";

import Modal from "./Modal";

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-amber-700 hover:text-amber-900"
      >
        Check in
      </button>

      <Modal open={open} onClose={() => setOpen(false)} labelledBy="check-in-title">
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
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
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
              className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-4 py-1.5 rounded-lg text-sm font-semibold"
            >
              Check in
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
