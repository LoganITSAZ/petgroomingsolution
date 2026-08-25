"use client";

import { useEffect, useRef } from "react";

export default function MobileMenu({ children }: { children: React.ReactNode }) {
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
    <details ref={menuRef} className="relative">
      <summary className="cursor-pointer list-none px-2 py-1.5 rounded-lg bg-stone-800 text-sm font-semibold">
        ☰
      </summary>
      <nav className="absolute left-0 mt-2 w-56 bg-stone-900 rounded-lg shadow-xl p-2 text-sm z-50">
        {children}
      </nav>
    </details>
  );
}