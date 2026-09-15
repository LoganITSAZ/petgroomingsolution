"use client";

import { useState } from "react";
import OfficeIcon from "./OfficeIcon";

/** A compact record photo, with a stable fallback for missing or broken images. */
export default function ProfileAvatar({
  src,
  name,
  pet = false,
  size = 44,
}: {
  src: string | null;
  name: string;
  pet?: boolean;
  size?: number;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <span
      aria-hidden="true"
      className="profile-avatar"
      style={{ width: size, height: size }}
    >
      {src && src !== failedSrc ? (
        // These authenticated images are already served by the photo endpoint.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} loading="lazy"
          className="h-full w-full object-cover" onError={() => setFailedSrc(src)} />
      ) : pet ? <OfficeIcon name="paw" /> : (
        name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
