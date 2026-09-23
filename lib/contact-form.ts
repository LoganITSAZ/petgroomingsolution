import { z } from "zod";

export const contactBody = z.object({
  name: z.string().trim().min(1).max(100).regex(/^[^\r\n]+$/),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).default(""),
  message: z.string().trim().min(10).max(5000),
  website: z.string().max(500).default(""),
});

export const contactSettings = z.object({
  contactFormEnabled: z.boolean(),
  contactRecipient: z.string().trim().email().max(254).or(z.literal("")),
  contactRequirePhone: z.boolean(),
  contactSuccessMessage: z.string().trim().min(1).max(500),
}).refine(value => !value.contactFormEnabled || Boolean(value.contactRecipient), {
  message: "Enter a recipient email before enabling the contact form.",
  path: ["contactRecipient"],
});

/**
 * nginx sets X-Real-IP from $remote_addr but appends to X-Forwarded-For, so the
 * leftmost XFF entry is whatever the caller sent — spoofing it would give one
 * client an unlimited number of per-client buckets. Trust X-Real-IP, and fall
 * back to the *last* XFF entry, which is the peer the proxy itself saw.
 */
export function clientKey(headers: Headers) {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = headers.get("x-forwarded-for")?.split(",") ?? [];
  return hops[hops.length - 1]?.trim() || "unknown";
}

// Best-effort per-process protection, with a global cap to bound mail volume
// even when a caller rotates addresses. Entries expire to bound memory use.
const attempts = new Map<string, { count: number; expires: number }>();
export function allowContactAttempt(key: string, now = Date.now()) {
  for (const [id, value] of attempts) if (value.expires <= now) attempts.delete(id);
  const global = attempts.get("global") ?? { count: 0, expires: now + 60_000 };
  const client = attempts.get(`client:${key}`) ?? { count: 0, expires: now + 15 * 60_000 };
  if (global.count >= 30 || client.count >= 5) return false;
  global.count++;
  client.count++;
  attempts.set("global", global);
  attempts.set(`client:${key}`, client);
  return true;
}
