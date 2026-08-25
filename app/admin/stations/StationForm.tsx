"use client";

import { useState } from "react";
import Link from "next/link";
import { StaffRole, StationRole } from "@prisma/client";
import MultiPicker from "@/components/MultiPicker";
import { MAX_KENNEL_COLUMNS, MAX_KENNEL_ROWS, kennelLabel } from "@/lib/kennels";

const ROLE_COPY: Record<StationRole, { label: string; description: string }> = {
  GROOMER: {
    label: "Groomer",
    description: "A groom table. Holds one pet at a time and drives the station display.",
  },
  BATHING: {
    label: "Bathing",
    description: "A wash or bathing station. Holds one pet at a time.",
  },
  KENNEL: {
    label: "Kennel Unit",
    description:
      "A bank of kennels laid out as a grid. Staff assign each dog to a numbered door instead of the station itself.",
  },
};

// ADMIN is an access role, not a floor role, so it is not offered here.
const ASSIGNABLE_ROLES: StaffRole[] = [StaffRole.GROOMER, StaffRole.BATHER];

const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: "Admin",
  GROOMER: "Groomer",
  BATHER: "Bather",
};

export interface StationFormValues {
  name: string;
  allowedRoles: StaffRole[];
  role: StationRole;
  isActive: boolean;
  kennelRows: number;
  kennelColumns: number;
}

export default function StationForm({
  action,
  initial,
  submitLabel,
  occupiedLabels = [],
  stationId,
}: {
  action: (formData: FormData) => Promise<void>;
  initial: StationFormValues;
  submitLabel: string;
  /** Present when editing — carried through so the action knows the target. */
  stationId?: string;
  /** Doors that currently hold a pet — shrinking the grid cannot remove these. */
  occupiedLabels?: string[];
}) {
  const [role, setRole] = useState<StationRole>(initial.role);
  const [rows, setRows] = useState(initial.kennelRows);
  const [columns, setColumns] = useState(initial.kennelColumns);

  const isKennel = role === StationRole.KENNEL;
  const clampedRows = Math.min(Math.max(rows || 0, 0), MAX_KENNEL_ROWS);
  const clampedColumns = Math.min(Math.max(columns || 0, 0), MAX_KENNEL_COLUMNS);
  const total = clampedRows * clampedColumns;

  const strandedDoors = occupiedLabels.filter((label) => {
    const row = label.charCodeAt(0) - 64;
    const column = Number(label.slice(1));
    return row > clampedRows || column > clampedColumns;
  });

  return (
    <form action={action} className="space-y-3">
      {stationId && <input type="hidden" name="id" value={stationId} />}
      <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-5">
        <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3">
          Identity
        </h2>

        <div className="grid grid-cols-3 gap-3 items-start">
          <label htmlFor="name" className="text-sm font-medium text-stone-700 pt-2">
            Name <span className="text-red-700">*</span>
          </label>
          <div className="col-span-2">
            <input
              id="name"
              name="name"
              required
              defaultValue={initial.name}
              placeholder="Kennel Bank A"
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <p className="text-xs text-stone-400 mt-1">
              Used everywhere staff see this station, including the touchscreen.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 pt-1">
          <div className="flex-1">
            <p className="text-sm font-medium text-stone-800">Active</p>
            <p className="text-sm text-stone-500 mt-0.5">
              Inactive stations stay on file but are hidden from the floor.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer mt-0.5">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={initial.isActive}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700" />
          </label>
        </div>
      </div>

      {/* Role */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3 mb-3">
          Role
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(Object.keys(ROLE_COPY) as StationRole[]).map((value) => (
            <label
              key={value}
              className={`border rounded-xl p-4 cursor-pointer transition-colors ${
                role === value
                  ? "border-amber-500 bg-amber-50"
                  : "border-stone-200 hover:border-stone-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  onChange={() => setRole(value)}
                  className="accent-amber-700"
                />
                <span className="font-semibold text-sm text-stone-900">
                  {ROLE_COPY[value].label}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-1.5">{ROLE_COPY[value].description}</p>
            </label>
          ))}
        </div>
      </div>

      {/* Who may work here */}
      <div className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="text-base font-semibold text-stone-800 border-b border-stone-100 pb-3 mb-3">
          Who can work this station
        </h2>
        <MultiPicker
          name="allowedRoles"
          initialIds={initial.allowedRoles}
          options={ASSIGNABLE_ROLES.map((role) => ({
            id: role,
            label: STAFF_ROLE_LABEL[role],
          }))}
          addLabel="+ Add another role"
          placeholder="Anyone on staff"
          noun="role"
          required={false}
        />
        <p className="text-xs text-stone-400 mt-2">
          Leave it empty to allow anyone. With roles listed, only staff holding one of them can be
          assigned to a pet at this station.
        </p>
      </div>

      {/* Kennel grid */}
      {isKennel && (
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-5">
          <div className="border-b border-stone-100 pb-3">
            <h2 className="text-base font-semibold text-stone-800">Kennel Layout</h2>
            <p className="text-sm text-stone-500 mt-1">
              Enter the unit as it is physically built. Doors are labelled by row letter and
              column number, so row 1 column 3 is A3.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 items-start">
            <label htmlFor="kennelRows" className="text-sm font-medium text-stone-700 pt-2">
              Rows
            </label>
            <div className="col-span-2">
              <input
                id="kennelRows"
                name="kennelRows"
                type="number"
                min={1}
                max={MAX_KENNEL_ROWS}
                value={rows}
                onChange={(e) => setRows(Number(e.target.value))}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-start">
            <label htmlFor="kennelColumns" className="text-sm font-medium text-stone-700 pt-2">
              Kennels per row
            </label>
            <div className="col-span-2">
              <input
                id="kennelColumns"
                name="kennelColumns"
                type="number"
                min={1}
                max={MAX_KENNEL_COLUMNS}
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          {/* Live preview of the doors that will exist */}
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
              Preview — {total} kennel{total !== 1 ? "s" : ""}
            </p>
            {total === 0 ? (
              <p className="text-sm text-stone-400">Set rows and kennels per row to see the unit.</p>
            ) : (
              <div className="space-y-1.5 overflow-x-auto">
                {Array.from({ length: clampedRows }, (_, r) => (
                  <div key={r} className="flex gap-1.5">
                    {Array.from({ length: clampedColumns }, (_, c) => {
                      const label = kennelLabel(r + 1, c + 1);
                      const occupied = occupiedLabels.includes(label);
                      return (
                        <span
                          key={label}
                          className={`w-11 h-9 rounded-md border text-xs font-semibold flex items-center justify-center flex-shrink-0 ${
                            occupied
                              ? "border-amber-400 bg-amber-100 text-amber-800"
                              : "border-stone-200 bg-stone-50 text-stone-500"
                          }`}
                        >
                          {label}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {strandedDoors.length > 0 && (
            <p className="text-sm text-amber-700">
              {strandedDoors.join(", ")} currently hold{strandedDoors.length === 1 ? "s" : ""} a pet
              and sit outside this layout. Those doors are kept until they are emptied.
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Link
          href="/admin/stations"
          className="px-5 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100 transition-colors"
        >
          Cancel
        </Link>
        {stationId && (
          <button
            type="submit"
            name="then"
            value="stay"
            className="px-5 py-2 rounded-lg text-sm font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
          >
            Save and keep editing
          </button>
        )}
        <button
          type="submit"
          name="then"
          value="list"
          className="bg-amber-700 hover:bg-amber-800 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
