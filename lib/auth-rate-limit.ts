import { clientKey } from "@/lib/contact-form";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; expires: number }>();

export function allowAuthAttempt(action: string, headers: Headers, now = Date.now()): boolean {
  for (const [key, value] of attempts) {
    if (value.expires <= now) attempts.delete(key);
  }

  const key = `${action}:${clientKey(headers)}`;
  const current = attempts.get(key) ?? { count: 0, expires: now + WINDOW_MS };
  if (current.count >= MAX_ATTEMPTS) return false;

  current.count++;
  attempts.set(key, current);
  return true;
}
