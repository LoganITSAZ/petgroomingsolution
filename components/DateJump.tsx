"use client";

/**
 * The readable date, with the browser's own calendar behind it.
 *
 * A native <input type="date"> only opens its picker when the calendar icon is
 * clicked — and this input is invisible, lying over the date the shop actually
 * reads ("Wednesday, September 24" rather than 2026-09-24). `showPicker()` is
 * what opens it from anywhere on the label, so this is a client component for
 * one handler and nothing else. The form around it stays server-rendered.
 *
 * Keyboard: the input takes focus like any field, the label draws its ring, and
 * Enter or Space opens the calendar instead of submitting an unchanged date.
 */
export default function DateJump({
  name,
  defaultValue,
  label,
  ariaLabel,
  widthClass,
}: {
  name: string;
  defaultValue: string;
  label: string;
  ariaLabel: string;
  widthClass: string;
}) {
  /* Not every browser has showPicker (Safari before 16), and it throws if the
     call is not from a user gesture. Either way the field still works — it is
     focused and typeable — so a failure here is never worth an error. */
  const openPicker = (input: HTMLInputElement) => {
    try {
      input.showPicker?.();
    } catch {
      /* no picker; the field itself still takes a date */
    }
  };

  return (
    <>
      <input
        name={name}
        type="date"
        aria-label={ariaLabel}
        defaultValue={defaultValue}
        onClick={(event) => openPicker(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker(event.currentTarget);
          }
        }}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span
        className={`${widthClass} rounded-lg px-2 py-1 text-center text-sm font-semibold text-stone-800 transition-colors peer-hover:bg-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2`}
      >
        {label}
      </span>
    </>
  );
}
