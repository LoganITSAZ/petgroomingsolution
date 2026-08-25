/**
 * In-process SSE subscriber registry for station displays.
 *
 * Lives here rather than in the route module because Next.js only permits
 * route handler exports (GET, POST, …) from a `route.ts` file — exporting
 * `broadcastToStation` from there fails the build.
 *
 * NOTE: state is per-process. This only works while the app runs as a single
 * instance. Scaling out (or moving to serverless) requires replacing this with
 * a shared pub/sub layer.
 */

import { Prisma } from "@prisma/client";

/**
 * Exactly what the lobby screen is allowed to see.
 *
 * `/station/[id]` and its event stream are deliberately unauthenticated — the
 * Pi has no login — so anyone who can reach the app can read this payload with
 * only a station id. It is therefore an allowlist of the fields the kiosk
 * actually renders. Never widen it to `pet: true` or a bare customer include:
 * that puts an email address and a pet's whole record on a screen facing the
 * waiting room.
 */
export const KIOSK_APPOINTMENT_SELECT = {
  id: true,
  status: true,
  serviceType: true,
  pet: {
    select: {
      name: true,
      species: true,
      breed: true,
      weightLbs: true,
      groomingNotes: true,
      healthFlags: true,
      hasBiteHistory: true,
      photoUrl: true,
    },
  },
  // Name only: a phone number on a lobby-facing screen is readable by
  // everyone waiting, and this stream needs no login to read.
  customer: { select: { firstName: true, lastName: true } },
  staff: { select: { name: true } },
} satisfies Prisma.AppointmentSelect;

const subscribers = new Map<string, Set<ReadableStreamDefaultController>>();

/** Register an SSE controller for a station. Returns an unsubscribe function. */
export function subscribeToStation(
  stationId: string,
  controller: ReadableStreamDefaultController
): () => void {
  let set = subscribers.get(stationId);
  if (!set) {
    set = new Set();
    subscribers.set(stationId, set);
  }
  set.add(controller);

  return () => {
    const current = subscribers.get(stationId);
    if (!current) return;
    current.delete(controller);
    if (current.size === 0) subscribers.delete(stationId);
  };
}

/**
 * Broadcast a JSON payload to all SSE clients watching a given station.
 * Called by the status-update API after any appointment status change.
 */
export function broadcastToStation(stationId: string, data: unknown): void {
  const controllers = subscribers.get(stationId);
  if (!controllers) return;

  const encoded = new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
  controllers.forEach((controller) => {
    try {
      controller.enqueue(encoded);
    } catch {
      // client disconnected — cleaned up by the stream's abort handler
    }
  });
}

/**
 * Snapshot of live SSE connections, for the admin health view.
 * Per-process, like `subscribers` itself.
 */
export function stationSubscriberCounts(): { stationId: string; connections: number }[] {
  return Array.from(subscribers.entries()).map(([stationId, set]) => ({
    stationId,
    connections: set.size,
  }));
}
