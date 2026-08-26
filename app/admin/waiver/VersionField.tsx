"use client";

import { useState } from "react";

/**
 * Version, in one row.
 *
 * It used to be two stacked radios with a paragraph each and a permanently
 * visible input that was disabled most of the time — three controls and four
 * lines of prose for a decision that is almost always "leave it alone".
 *
 * Now the choice is a segmented control and only the consequence of the
 * current choice is shown: automatic says which number saving will publish,
 * manual gives you the box to type one. The radios are still radios, so the
 * form posts the same `versionMode` and arrow keys still work.
 */
export default function VersionField({
  currentVersion,
  nextVersion,
}: {
  currentVersion: string;
  nextVersion: string;
}) {
  const [manual, setManual] = useState(false);

  const segment = (value: boolean, label: string) => (
    <label
      className={[
        "px-3 py-1 text-sm rounded-md cursor-pointer transition-colors",
        manual === value
          ? "bg-white text-stone-900 font-semibold shadow-sm"
          : "text-stone-600 hover:text-stone-900",
      ].join(" ")}
    >
      <input
        type="radio"
        name="versionMode"
        value={value ? "manual" : "auto"}
        checked={manual === value}
        onChange={() => setManual(value)}
        className="sr-only"
      />
      {label}
    </label>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-sm font-medium text-stone-700">Version</span>

      <div
        role="radiogroup"
        aria-label="How the version is set"
        className="inline-flex items-center gap-0.5 bg-stone-100 rounded-lg p-0.5"
      >
        {segment(false, "Automatic")}
        {segment(true, "Set manually")}
      </div>

      {manual ? (
        <input
          type="text"
          name="waiverVersion"
          aria-label="Waiver version"
          defaultValue={currentVersion}
          placeholder="1.0"
          className="w-28 border border-stone-200 rounded-lg px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      ) : (
        <span className="text-sm text-stone-500">
          Now <span className="font-semibold text-stone-700 tabular-nums">{currentVersion}</span> ·
          changed text publishes{" "}
          <span className="font-semibold text-stone-700 tabular-nums">{nextVersion}</span>
        </span>
      )}

      <span className="text-xs text-stone-400 basis-full">
        {manual
          ? "Restoring an earlier document under its original number is the reason this exists."
          : "Saving without touching the text keeps the current number, so nobody re-accepts for nothing."}
      </span>
    </div>
  );
}
