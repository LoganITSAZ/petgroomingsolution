"use client";

import { ThemePreference } from "@prisma/client";

const OPTIONS = [
  { value: ThemePreference.SYSTEM, label: "System" },
  { value: ThemePreference.LIGHT, label: "Light" },
  { value: ThemePreference.DARK, label: "Dark" },
] as const;

/**
 * Theme, as one segmented control.
 *
 * It was a select and a Save button — three interactions and a reload to
 * answer a question about how the screen looks. This saves on the click that
 * changes it; the answer is visible when the page comes back, which is the
 * only confirmation the setting needs.
 *
 * System is the default for anyone who has never touched it: someone whose
 * laptop dims at sunset expects the back office to come with it, and the two
 * fixed options are for the people who want it not to.
 */
export default function ThemeSwitch({ value }: { value: ThemePreference }) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-semibold text-stone-700">Theme</legend>
      {/* The selected segment paints from the surface tokens rather than
          white: `.dark` redefines the variables, whereas an override for
          `peer-checked:bg-white` would be one more class in the paired list —
          without it the chip stayed pure white on a dark screen. The track is
          stone-200 so the chip, at card colour, still stands off it. */}
      <div className="inline-flex rounded-lg border border-stone-300 bg-stone-200 p-0.5">
        {OPTIONS.map((option) => (
          <span key={option.value} className="contents">
            <input
              type="radio"
              id={`theme-${option.value}`}
              name="themePreference"
              value={option.value}
              defaultChecked={value === option.value}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="peer sr-only"
            />
            <label
              htmlFor={`theme-${option.value}`}
              className="cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold text-stone-600 transition peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500"
            >
              {option.label}
            </label>
          </span>
        ))}
      </div>
    </fieldset>
  );
}
