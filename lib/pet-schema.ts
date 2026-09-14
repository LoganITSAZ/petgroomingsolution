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

/**
 * The flags a shop reaches for most often, offered as chips on the pet form.
 *
 * Presets, not a vocabulary: `Pet.healthFlags` is free text and the form lets
 * anything be typed. Flags already on the shop's own pets are offered beside
 * these, so what staff type once is one click the next time.
 */
export const HEALTH_FLAG_PRESETS = [
  "elderly",
  "puppy",
  "arthritis",
  "heart condition",
  "seizures",
  "diabetic",
  "reactive",
  "anxious",
  "deaf",
  "blind",
  "skin condition",
  "recent surgery",
  "pregnant",
  "allergy:chicken",
  "no heat drying",
] as const;
