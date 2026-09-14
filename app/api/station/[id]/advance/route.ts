import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { changeAppointmentStatus } from "@/lib/appointment-status";
import { nextStatus } from "@/lib/appointment-flow";
import { parseBody } from "@/lib/api-validation";
import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({ appointmentId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 401 });
  }
  const { id: stationId } = await params;

  const parsed = await parseBody(req, Body);
  if ("response" in parsed) return parsed.response;

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.data.appointmentId },
    select: { id: true, status: true, stationId: true },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  // The scope of the whole route: this screen only advances what stands at it.
  if (appointment.stationId !== stationId) {
    return NextResponse.json({ error: "That pet is not at this station" }, { status: 403 });
  }

  const next = nextStatus(appointment.status);
  if (!next) {
    return NextResponse.json({ error: "Nothing left to advance" }, { status: 409 });
  }

  const updated = await changeAppointmentStatus({
    appointmentId: appointment.id,
    status: next,
    note: "Advanced at the station display",
    staffId: session.user.id,
  });

  return NextResponse.json({ status: updated.status });
}
