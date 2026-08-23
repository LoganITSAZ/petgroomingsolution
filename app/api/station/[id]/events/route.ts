import { prisma } from "@/lib/prisma";
import { subscribeToStation } from "@/lib/station-events";
import { NextRequest } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id: stationId } = params;

  // Verify station exists
  const station = await prisma.station.findUnique({ where: { id: stationId } });
  if (!station) {
    return new Response("Station not found", { status: 404 });
  }

  // Fetch current appointment for initial state
  const currentAppointment = await prisma.appointment.findFirst({
    where: {
      stationId,
      status: {
        notIn: ["COMPLETE", "READY_PICKUP", "PICKED_UP", "CANCELLED", "NO_SHOW"],
      },
    },
    include: {
      pet: true,
      customer: { select: { firstName: true, lastName: true, phone: true, email: true } },
      staff: { select: { name: true } },
    },
    orderBy: { checkedInAt: "asc" },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribeToStation(stationId, controller);

      // Send initial state immediately
      const initial = `data: ${JSON.stringify({ type: "init", appointment: currentAppointment, station })}\n\n`;
      controller.enqueue(encoder.encode(initial));

      // Heartbeat every 30s to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Cleanup on disconnect
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable Nginx buffering
    },
  });
}
