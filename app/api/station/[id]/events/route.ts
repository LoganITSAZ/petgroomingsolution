import { prisma } from "@/lib/prisma";
import { KIOSK_APPOINTMENT_SELECT, subscribeToStation } from "@/lib/station-events";
import { getKennelBoard } from "@/lib/kennels";
import { OCCUPYING_STATUSES } from "@/lib/stations";
import { StationRole } from "@prisma/client";
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

  // Kennel units stream their whole board instead of a single appointment
  const isKennel = station.role === StationRole.KENNEL;
  const kennels = isKennel ? await getKennelBoard(stationId) : [];

  // A station can hold several pets, so the screen is sent the whole list.
  const appointments = isKennel
    ? []
    : await prisma.appointment.findMany({
        where: { stationId, status: { in: OCCUPYING_STATUSES } },
        select: KIOSK_APPOINTMENT_SELECT,
        orderBy: { checkedInAt: "asc" },
      });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribeToStation(stationId, controller);

      // Send initial state immediately
      const initial = `data: ${JSON.stringify(
        isKennel
          ? { type: "init", station, kennels }
          : { type: "init", appointments, station }
      )}\n\n`;
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
