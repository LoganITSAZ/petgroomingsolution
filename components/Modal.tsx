"use client";

import { useEffect, useRef } from "react";

/**
 * A modal on the platform's own `<dialog>`.
 *
 * `showModal()` is the whole accessibility contract: it traps Tab inside the
 * panel, makes the rest of the page inert, closes on Escape, and returns focus
 * to whatever opened it. Only the body scroll lock is left to us — the page
 * behind a modal must not scroll under it.
 *
 * Children are mounted only while open, so a form inside starts fresh each
 * time. Padding lives on the inner wrapper: a click landing on the `<dialog>`
 * itself is a backdrop click, and padding would swallow it.
 */
export default function Modal({
  open,
  onClose,
  labelledBy,
  className = "max-w-md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      dialog.close();
      return;
    }
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`w-full ${className} rounded-xl bg-white p-0 text-left shadow-xl backdrop:bg-stone-900/40`}
    >
      {open && <div className="max-h-[85vh] overflow-y-auto p-4">{children}</div>}
    </dialog>
  );
}
