import { z } from "zod";

/**
 * A pet's `photoUrl` is rendered straight into an `<img src>`, including on
 * the lobby kiosk, and a customer can set it on their own pet. Restricting it
 * to http(s) or a site-relative path keeps `javascript:` and `data:` out of
 * that attribute.
 */
export const PhotoUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (value) => value.startsWith("/") || /^https?:\/\//i.test(value),
    "photoUrl must be an http(s) address or a site-relative path"
  );
