"use client";

import { useState } from "react";

/**
 * Version is derived by default — editing the text publishes the next number
 * automatically. Manual entry exists so an admin can put an exact number back,
 * which is what restoring an earlier document needs.
 */
export default function VersionField({
  currentVersion,
  nextVersion,
}: {
  currentVersion: string;
  nextVersion: string;
}) {
  const [manual, setManual] = useState(false);

  return (
    <div className="grid grid-cols-3 gap-3 items-start">
      <span className="text-sm font-medium text-stone-700 pt-2">Waiver Version</span>
      <div className="col-span-2 space-y-3">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="versionMode"
            value="auto"
            checked={!manual}
            onChange={() => setManual(false)}
            className="mt-1 accent-amber-700"
          />
          <span className="text-sm text-stone-700">
            Version automatically
            <span className="block text-xs text-stone-400">
              Currently {currentVersion}. Saving changed text publishes {nextVersion}; saving
              without touching the text keeps {currentVersion}.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            name="versionMode"
            value="manual"
            checked={manual}
            onChange={() => setManual(true)}
            className="mt-1 accent-amber-700"
          />
          <span className="text-sm text-stone-700">
            Set the version myself
            <span className="block text-xs text-stone-400">
              For restoring an earlier document under its original number.
            </span>
          </span>
        </label>

        <input
          type="text"
          name="waiverVersion"
          aria-label="Waiver version"
          defaultValue={currentVersion}
          disabled={!manual}
          placeholder="1.0"
          className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-stone-50 disabled:text-stone-400"
        />
      </div>
    </div>
  );
}
