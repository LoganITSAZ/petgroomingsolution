"use client";

import { useEffect, useRef } from "react";

export default function MobileMenu({
  children,
  label = "Open navigation menu",
  className = "",
  summaryClassName = "bg-stone-800",
  menuClassName = "bg-stone-900",
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
  summaryClassName?: string;
  menuClassName?: string;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const menu = menuRef.current;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    }

    function closeOnLinkSelection(event: MouseEvent) {
      if (menu?.open && event.target instanceof Element && event.target.closest("a")) {
        menu.open = false;
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    menu?.addEventListener("click", closeOnLinkSelection);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      menu?.removeEventListener("click", closeOnLinkSelection);
    };
  }, []);

  return (
    <details ref={menuRef} className={`relative ${className}`}>
      <summary
        aria-label={label}
        className={`cursor-pointer list-none rounded-lg px-2 py-1.5 text-sm font-semibold ${summaryClassName}`}
      >
        <span aria-hidden="true">☰</span>
      </summary>
      <nav aria-label={label.replace(/^Open /, "")} className={`absolute left-0 z-50 mt-2 w-56 rounded-lg p-2 text-sm shadow-xl ${menuClassName}`}>
        {children}
      </nav>
    </details>
  );
}
