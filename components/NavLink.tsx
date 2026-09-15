"use client";

import Link from "next/link";
import OfficeIcon, { navigationIcon } from "./OfficeIcon";
import { usePathname } from "next/navigation";

/**
 * A sidebar link that knows whether you are on it.
 *
 * The back office had no current-page indication at all: every link looked
 * identical, so the only way to tell where you were was to read the heading.
 * `aria-current` carries that to a screen reader; the fill and the left rule
 * carry it to everyone else.
 *
 * A link matches when the path is the link, or sits beneath it — /staff is the
 * exception, since every floor screen sits beneath it and it would never turn
 * off.
 */
export default function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/staff" || href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "office-nav-link relative block px-3 py-2 rounded-lg transition-colors",
        active
          ? "office-nav-link-active font-semibold"
          : "text-ink",
      ].join(" ")}
    >
      <OfficeIcon name={navigationIcon(href)} />
      <span>{label}</span>
    </Link>
  );
}
