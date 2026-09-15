"use client";

import { useId, useState, useSyncExternalStore } from "react";
import StaffProfileDialog, { type StaffProfile } from "./StaffProfileDialog";

import Modal from "./Modal";

const columns = [
  { id: "roles", label: "Roles" },
  { id: "presence", label: "Availability" },
  { id: "pet", label: "Current pet" },
  { id: "service", label: "Service / stage" },
  { id: "station", label: "Station" },
  { id: "shift", label: "Today's shift" },
  { id: "progress", label: "Done / assigned" },
  { id: "activity", label: "Latest activity" },
  { id: "email", label: "Email" },
  { id: "home", label: "Home station" },
  { id: "changes", label: "Status changes today" },
] as const;
type Column = (typeof columns)[number]["id"];
const defaults: Column[] = ["roles", "presence", "pet", "service", "station", "shift", "progress"];

function cell(profile: StaffProfile, column: Column) {
  switch (column) {
    case "roles": return profile.roles.join(" · ");
    case "presence": return <><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${profile.presenceClass}`}>{profile.presenceLabel}</span><span className="block text-xs text-stone-400 mt-1">{profile.minutesInState}m in state</span></>;
    case "pet": return profile.current ? <>{profile.current.petName}{profile.current.hasBiteHistory && <span className="ml-1 text-xs font-bold text-red-700">⚠ Bite</span>}<span className="block text-xs text-stone-400">{profile.current.ownerName}</span></> : "No pet assigned";
    case "service": return profile.current ? <>{profile.current.services}<span className={`block w-fit mt-1 rounded-full px-2 py-0.5 text-xs ${profile.current.statusClass}`}>{profile.current.statusLabel}</span></> : "—";
    case "station": return profile.current?.stationName ?? "—";
    case "shift": return profile.scheduledToday ?? "Not scheduled";
    case "progress": return `${profile.finished} / ${profile.assigned}`;
    case "email": return profile.email;
    case "home": return profile.homeStation ?? "Not assigned";
    case "changes": return profile.changesToday;
    case "activity": { const latest = profile.activity[0]; return latest ? `${latest.at} · ${latest.petName} → ${latest.statusLabel}` : "No activity today"; }
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("staff-columns-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("staff-columns-change", onChange);
  };
}

// Also keep choices usable when browser storage is unavailable.
const memory = new Map<string, string>();

function useStaffColumns(viewerId: string) {
  const storageKey = `staff-table-columns:v1:${viewerId}`;
  const saved = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(storageKey) ?? memory.get(storageKey) ?? null; }
    catch { return memory.get(storageKey) ?? null; }
  }, () => null);
  let visible: Column[] = defaults;
  try {
    const parsed: unknown = JSON.parse(saved ?? "null");
    if (Array.isArray(parsed)) visible = columns.filter(column => parsed.includes(column.id)).map(column => column.id);
  } catch { /* Invalid preferences fall back to the defaults. */ }

  function update(next: Column[]) {
    const value = JSON.stringify(next);
    memory.set(storageKey, value);
    try { localStorage.setItem(storageKey, value); } catch { /* Keep changes for this visit. */ }
    window.dispatchEvent(new Event("staff-columns-change"));
  }
  return { visible, update };
}

export function StaffColumnsButton({ viewerId }: { viewerId: string }) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const titleId = useId();
  const { visible, update } = useStaffColumns(viewerId);

  return (
    <>
          <button
            type="button"
            onClick={() => setColumnsOpen(true)}
            aria-haspopup="dialog"
            aria-label="Choose columns"
            title="Choose columns"
            className="ml-auto flex h-7 w-7 cursor-pointer items-center justify-center rounded text-stone-500 hover:bg-well hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M9 4v16M15 4v16" />
            </svg>
          </button>
      <Modal open={columnsOpen} onClose={() => setColumnsOpen(false)} labelledBy={titleId}>
          <h2 id={titleId} className="text-lg font-bold text-stone-900">Choose columns</h2>
          <fieldset className="mt-3">
            <legend className="text-xs text-stone-500 mb-2">Choose columns. Preferences are saved for your account in this browser. Staff names always stay visible.</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
              {columns.map(column => <label key={column.id} className="flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={visible.includes(column.id)} onChange={event => update(event.target.checked ? [...visible, column.id] : visible.filter(id => id !== column.id))} />
                {column.label}
              </label>)}
            </div>
            <button type="button" onClick={() => update(defaults)} className="mt-3 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-well">Reset columns</button>
          </fieldset>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setColumnsOpen(false)} className="rounded-lg bg-stone-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-stone-900">Done</button>
          </div>
      </Modal>
    </>
  );
}

export default function StaffTable({ profiles, viewerId, canManage }: {
  profiles: StaffProfile[];
  viewerId: string;
  canManage: boolean;
}) {
  const { visible } = useStaffColumns(viewerId);
  const selected = columns.filter(column => visible.includes(column.id));

  return (
    <>
      {/* Keyboard users can focus this region to scroll the overflowing columns. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className="w-full min-w-0 max-w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600" role="region" aria-label="Staff table" tabIndex={0}>
        <table data-own-columns className="w-full text-sm text-left">
          <caption className="sr-only">Staff availability, assignments and daily progress</caption>
          <thead className="bg-well text-xs text-stone-500">
            <tr>
              <th scope="col" className="px-3 py-2">Staff</th>
              {selected.map(column => <th scope="col" key={column.id} className="px-3 py-2 whitespace-nowrap">{column.label}</th>)}
              <td className="w-10 px-3 py-2"><StaffColumnsButton viewerId={viewerId} /></td>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {profiles.map(profile => <tr key={profile.id} className="hover:bg-well transition-colors">
              <th scope="row" className="min-w-40 align-top font-semibold text-stone-900">
                <StaffProfileDialog profile={profile} canSeeAnalytics={canManage}><span className="underline decoration-stone-300 underline-offset-2">{profile.name}</span></StaffProfileDialog>
              </th>
              {selected.map(column => <td key={column.id} className="px-3 py-2 align-top text-stone-600 min-w-28">{cell(profile, column.id)}</td>)}
              <td />
            </tr>)}
          </tbody>
        </table>
      </div>
    </>
  );
}
