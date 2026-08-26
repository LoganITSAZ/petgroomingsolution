"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A button that opens a real dialog.
 *
 * Adding a service used to be a `<details>` accordion: opening it pushed the
 * catalogue below it down the page, and a long form left you scrolling past
 * the thing you were trying to add. A modal is the honest shape for this —
 * you are doing one thing, and the list can wait.
 *
 * Native `<dialog>` on purpose: Escape, the focus trap, the inert background
 * and the backdrop are the browser's job, and every hand-rolled version of
 * them gets at least one wrong.
 */
export default function ModalButton({
  label,
  title,
  description,
  children,
  variant = "primary",
}: {
  label: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // The page scrolling behind an open modal is the giveaway that it is not
  // really modal.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const show = () => {
    ref.current?.showModal();
    setOpen(true);
  };
  const close = () => {
    ref.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={[
          "text-sm font-bold px-3 py-1.5 rounded-lg transition-colors",
          variant === "primary"
            ? "bg-brand-600 text-brand-on-600 hover:bg-brand-700 hover:text-brand-on-700"
            : "border border-stone-200 text-stone-700 hover:bg-stone-50",
        ].join(" ")}
      >
        {label}
      </button>

      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        // Clicking the backdrop is the dialog element itself; a click on the
        // panel stops before it gets here.
        onClick={(event) => {
          if (event.target === ref.current) close();
        }}
        aria-label={title}
        className="app-modal w-full max-w-2xl rounded-xl border border-stone-200 bg-white p-0 shadow-xl backdrop:bg-stone-900/40"
      >
        <div onClick={(event) => event.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-3">
            <div className="min-w-0">
              <h2 className="font-bold text-stone-900">{title}</h2>
              {description && <p className="text-sm text-stone-500 mt-0.5">{description}</p>}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-1 -mt-1 flex-none rounded-md px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
        </div>
      </dialog>
    </>
  );
}
