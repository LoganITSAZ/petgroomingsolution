"use client";

import { useState } from "react";
import Link from "next/link";
import { PageSection } from "@/components/ui";
import { StaffRole, StationRole } from "@prisma/client";
import TagPicker from "@/components/TagPicker";
import { MAX_KENNEL_COLUMNS, MAX_KENNEL_ROWS, kennelLabel } from "@/lib/kennels";
import { formatRole } from "@/lib/utils";

const ROLE_COPY: Record<StationRole, { label: string; description: string }> = {
  GROOMER: {
    label: "Grooming",
    description: "A groom table. Holds one pet at a time and drives the station display.",
  },
  BATHING: {
    label: "Bathing",
    description: "A wash or bathing station. Holds one pet at a time.",
  },
  DRYING: {
    label: "Drying",
    description:
      "A dryer or drying table — the step between the bath and the groom table. Holds one pet at a time. A shop that dries on the groom table does not need one.",
  },
  KENNEL: {
    label: "Kennels",
    description:
      "A bank of kennels laid out as a grid. Staff assign each dog to a numbered door instead of the station itself.",
  },
};

// ADMIN and MANAGER are access roles, not floor roles, so neither is offered here.
const ASSIGNABLE_ROLES: StaffRole[] = [StaffRole.GROOMER, StaffRole.BATHER];

export interface StationFormValues {
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
    <form action={action}>
      {stationId && <input type="hidden" name="id" value={stationId} />}
      <PageSection title="Status" bodyClassName="space-y-5">
        {/* The label wraps the name as well as the switch; empty, the checkbox
            announced as "checkbox, unchecked" and nothing more. */}
        <div className="pt-1">
          <label className="flex items-start gap-3 cursor-pointer">
            <span className="flex-1 text-sm font-medium text-stone-800">Active</span>
            <span className="relative inline-flex flex-none items-center mt-0.5">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={initial.isActive}
                aria-describedby="isActive-description"
                className="sr-only peer"
              />
              <span className="block w-11 h-6 bg-stone-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-stone-900 dark:peer-focus-visible:outline-stone-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-700" />
            </span>
          </label>
          <p id="isActive-description" className="text-sm text-stone-500 mt-0.5">
            Inactive stations stay on file but are hidden from the storefront.
          </p>
        </div>
      </PageSection>

      {/* Role — also what the station is named after. */}
      <PageSection title="Role">
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
        <p className="text-xs text-stone-400 mt-3">
          Stations are named after their role and the next free number, so this is also what it is
          called on the touchscreen. Changing the role renames it.
        </p>
      </PageSection>

      {/* Who may work here */}
      <PageSection title="Who can work this station">
        <TagPicker
          name="allowedRoles"
          initialIds={initial.allowedRoles}
          options={ASSIGNABLE_ROLES.map((role) => ({
            id: role,
            label: formatRole(role),
          }))}
          optionsLabel="Roles"
          emptyLabel="Anyone on staff"
          noun="role"
          required={false}
        />
        <p className="text-xs text-stone-400 mt-2">
          Leave it empty to allow anyone. With roles listed, only staff holding one of them can be
          assigned to a pet at this station.
        </p>
      </PageSection>

      {/* Kennel grid */}
      {isKennel && (
        <PageSection bodyClassName="space-y-5">
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
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
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
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Live preview of the doors that will exist */}
          <div>
            <p className="text-xs font-semibold text-stone-500 tracking-tight mb-2">
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
        </PageSection>
      )}

      <PageSection tone="muted" bodyClassName="flex justify-end gap-3">
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
          className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-6 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          {submitLabel}
        </button>
      </PageSection>
    </form>
  );
}
