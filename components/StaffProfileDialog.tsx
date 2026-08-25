"use client";

import { useState } from "react";
import Link from "next/link";

import { useModalDialog } from "./useModalDialog";

/**
 * A staff row that opens into their detail.
 *
 * Everything is formatted server-side and passed as plain strings: the modal
 * is presentation only, so it can stay a small client island on an otherwise
 * server-rendered page.
 */

export interface StaffProfile {
  id: string;
  name: string;
  email: string;
  roles: string[];
  presenceLabel: string;
  presenceClass: string;
  minutesInState: number;
  scheduledToday: string | null;
  onShiftNow: boolean;
  finished: number;
  assigned: number;
  changesToday: number;
  homeStation: string | null;
  current: {
    appointmentId: string;
    petId: string;
    petName: string;
    hasBiteHistory: boolean;
    ownerName: string;
    stationId: string | null;
    stationName: string | null;
    statusLabel: string;
    statusClass: string;
    services: string;
    sinceLabel: string | null;
  } | null;
  week: { day: string; hours: string }[];
  activity: { at: string; petName: string; statusLabel: string }[];
}

export default function StaffProfileDialog({
  profile,
  children,
}: {
  profile: StaffProfile;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useModalDialog(open, () => setOpen(false));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-3 py-2 hover:bg-stone-50 transition-colors"
        aria-haspopup="dialog"
      >
        {children}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-stone-900/40 p-3 overflow-y-auto"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-profile-title"
            tabIndex={-1}
            className="bg-white rounded-xl shadow-xl w-full max-w-lg p-4 my-6"
          >
            {/* Who */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="staff-profile-title" className="text-lg font-black text-stone-900">
                  {profile.name}
                </h2>
                <p className="text-xs text-stone-400 truncate">{profile.email}</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-wide mt-0.5">
                  {profile.roles.join(" · ")}
                  {profile.homeStation && ` · home station ${profile.homeStation}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${profile.presenceClass}`}
                >
                  {profile.presenceLabel.toUpperCase()} · {profile.minutesInState}m
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-stone-400 hover:text-stone-700 text-sm"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Right now */}
            <section className="mt-3 border-t border-stone-100 pt-3">
              <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">
                Right now
              </h3>
              {profile.current ? (
                <div className="text-sm space-y-0.5">
                  <p>
                    <Link
                      href={`/staff/appointments/${profile.current.appointmentId}`}
                      className="font-bold text-stone-900 hover:text-amber-700"
                      onClick={() => setOpen(false)}
                    >
                      {profile.current.petName}
                    </Link>
                    {profile.current.hasBiteHistory && (
                      <span className="ml-1.5 text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold">
                        BITE
                      </span>
                    )}
                    <span className="text-stone-500"> · {profile.current.ownerName}</span>
                    <span
                      className={`ml-2 text-[10px] px-1.5 rounded-full font-medium ${profile.current.statusClass}`}
                    >
                      {profile.current.statusLabel}
                    </span>
                  </p>
                  <p className="text-stone-600">{profile.current.services}</p>
                  <p className="text-xs text-stone-400">
                    {profile.current.stationId ? (
                      <Link
                        href={`/staff/stations/${profile.current.stationId}`}
                        className="underline hover:text-stone-700"
                        onClick={() => setOpen(false)}
                      >
                        {profile.current.stationName}
                      </Link>
                    ) : (
                      "No station"
                    )}
                    {profile.current.sinceLabel && ` · ${profile.current.sinceLabel}`}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-stone-400">Not on a pet.</p>
              )}
            </section>

            {/* Today */}
            <section className="mt-3 border-t border-stone-100 pt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-black text-stone-900">
                  {profile.finished}
                  <span className="text-sm font-medium text-stone-400">/{profile.assigned}</span>
                </p>
                <p className="text-[10px] text-stone-500 uppercase tracking-wide">Done today</p>
              </div>
              <div>
                <p className="text-lg font-black text-stone-900">{profile.changesToday}</p>
                <p className="text-[10px] text-stone-500 uppercase tracking-wide">Status changes</p>
              </div>
              <div>
                <p className={`text-sm font-bold ${profile.onShiftNow ? "text-green-700" : "text-stone-400"}`}>
                  {profile.scheduledToday ?? "Not scheduled"}
                </p>
                <p className="text-[10px] text-stone-500 uppercase tracking-wide">Today&apos;s shift</p>
              </div>
            </section>

            {/* The week */}
            {profile.week.length > 0 && (
              <section className="mt-3 border-t border-stone-100 pt-3">
                <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">
                  Scheduled this week
                </h3>
                <ul className="text-sm divide-y divide-stone-100">
                  {profile.week.map((shift) => (
                    <li key={shift.day} className="py-1 flex justify-between gap-3">
                      <span className="text-stone-700">{shift.day}</span>
                      <span className="text-stone-500 whitespace-nowrap">{shift.hours}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* What they did today */}
            {profile.activity.length > 0 && (
              <section className="mt-3 border-t border-stone-100 pt-3">
                <h3 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">
                  Today&apos;s activity
                </h3>
                <ul className="text-sm divide-y divide-stone-100">
                  {profile.activity.map((entry, index) => (
                    <li key={index} className="py-1 flex justify-between gap-3">
                      <span className="text-stone-700 truncate">
                        {entry.petName} → {entry.statusLabel}
                      </span>
                      <span className="text-stone-400 whitespace-nowrap">{entry.at}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
