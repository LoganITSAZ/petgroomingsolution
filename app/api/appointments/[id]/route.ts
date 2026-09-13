import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { changeAppointmentStatus } from "@/lib/appointment-status";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { parseBody } from "@/lib/api-validation";

// Every field optional: a PATCH applies only the keys it actually sends.
const PatchBody = z.object({
  stationId: z.string().min(1).nullish(),
  staffId: z.string().min(1).nullish(),
  scheduledAt: z.coerce.date().optional(),
  durationMins: z.number().int().positive().nullish(),
  visitNotes: z.string().nullish(),
});

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
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

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
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const parsed = await parseBody(req, PatchBody);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  // A station or groomer that does not exist is a bad request, not the
  // foreign-key crash Prisma would otherwise return as a 500.
  if (body.stationId) {
    const station = await prisma.station.findUnique({ where: { id: body.stationId } });
    if (!station) {
      return NextResponse.json({ error: "Station not found" }, { status: 400 });
    }
  }
  if (body.staffId) {
    const staff = await prisma.staff.findUnique({ where: { id: body.staffId } });
    if (!staff) {
      return NextResponse.json({ error: "Staff member not found" }, { status: 400 });
    }
  }

  // Only the keys the caller sent are written, so an omitted field keeps its
  // current value while an explicit null clears it.
  const data: Prisma.AppointmentUncheckedUpdateInput = {};
  if ("stationId" in body) data.stationId = body.stationId ?? null;
  if ("staffId" in body) data.staffId = body.staffId ?? null;
  if ("visitNotes" in body) data.visitNotes = body.visitNotes ?? null;
  if ("durationMins" in body) data.durationMins = body.durationMins ?? null;
  if ("scheduledAt" in body) data.scheduledAt = body.scheduledAt;

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
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.appointment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (existing.status === AppointmentStatus.CANCELLED) {
    return NextResponse.json({ error: "Appointment is already cancelled" }, { status: 409 });
  }

  // Same path as every other status change: audit row, station display
  // refresh, kennel release, notifications.
  const cancelled = await changeAppointmentStatus({
    appointmentId: id,
    status: AppointmentStatus.CANCELLED,
    note: "Cancelled via API",
    staffId: session.user.id,
  });

  return NextResponse.json(cancelled);
}
