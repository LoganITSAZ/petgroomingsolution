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

/** Staff-only station records. Keep account credentials out of the payload. */
export const STATION_APPOINTMENT_SELECT = {
  id: true, status: true, serviceType: true, scheduledAt: true,
  checkedInAt: true, durationMins: true, visitNotes: true,
  pet: true,
  customer: { select: {
    id: true, firstName: true, lastName: true, email: true, phone: true,
    address: true, photoId: true, smsOptOut: true, pricingNotes: true,
    isActive: true,
    preferredStaff: { select: { name: true } },
    pricingTier: { select: { name: true } },
    alternateContacts: { select: { id: true, name: true, phone: true, email: true }, orderBy: { createdAt: "asc" } },
  } },
  staff: { select: { name: true } },
  services: { select: {
    id: true, serviceType: true, priceCents: true,
    service: { select: { name: true, staffNotes: true } },
  }, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.AppointmentSelect;

type Serialized<T> = T extends Date ? string : T extends readonly unknown[]
  ? { [K in keyof T]: Serialized<T[K]> }
  : T extends object ? { [K in keyof T]: Serialized<T[K]> } : T;
export type StationAppointment = Serialized<Prisma.AppointmentGetPayload<{
  select: typeof STATION_APPOINTMENT_SELECT;
}>>;

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
