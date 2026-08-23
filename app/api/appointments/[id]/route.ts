import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AppointmentStatus } from "@prisma/client";

const APPOINTMENT_INCLUDE = {
  pet: true,
  customer: true,
  station: true,
  staff: true,
  statusHistory: { orderBy: { changedAt: "asc" as const } },
  visitEvents: { orderBy: { occurredAt: "asc" as const }, include: { loggedBy: true } },
} as const;

// GET /api/appointments/[id]
// Auth: staff only
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: APPOINTMENT_INCLUDE,
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  return NextResponse.json(appointment);
}

// PATCH /api/appointments/[id]
// Auth: staff only
// Updatable fields: stationId, staffId, scheduledAt, durationMins, visitNotes
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { stationId, staffId, scheduledAt, durationMins, visitNotes } =
    body as Record<string, unknown>;

  // Build update payload — only include keys that were explicitly provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};

  if ("stationId" in (body as object)) data.stationId = stationId ?? null;
  if ("staffId" in (body as object)) data.staffId = staffId ?? null;
  if ("visitNotes" in (body as object)) data.visitNotes = visitNotes ?? null;
  if ("durationMins" in (body as object))
    data.durationMins = durationMins != null ? Number(durationMins) : null;

  if ("scheduledAt" in (body as object)) {
    const parsed = new Date(scheduledAt as string);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
    }
    data.scheduledAt = parsed;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data,
    include: APPOINTMENT_INCLUDE,
  });

  return NextResponse.json(updated);
}

// DELETE /api/appointments/[id]
// Auth: staff only
// Soft cancel — sets status to CANCELLED and creates a status history record
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = params;

  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (existing.status === AppointmentStatus.CANCELLED) {
    return NextResponse.json({ error: "Appointment is already cancelled" }, { status: 409 });
  }

  const cancelled = await prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id },
      data: { status: AppointmentStatus.CANCELLED },
      include: APPOINTMENT_INCLUDE,
    });

    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId: id,
        status: AppointmentStatus.CANCELLED,
        changedById: session.user.id,
        note: "Cancelled via API",
      },
    });

    return updated;
  });

  return NextResponse.json(cancelled);
}
