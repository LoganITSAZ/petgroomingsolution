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
