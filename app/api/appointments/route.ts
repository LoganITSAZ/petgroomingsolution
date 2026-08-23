import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AppointmentStatus, AppointmentType, ServiceType } from "@prisma/client";

const APPOINTMENT_INCLUDE = {
  pet: true,
  customer: true,
  station: true,
  staff: true,
  statusHistory: { orderBy: { changedAt: "asc" as const } },
} as const;

// GET /api/appointments
// Auth: staff only
// Query params: date (YYYY-MM-DD), status, customerId, petId
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");       // YYYY-MM-DD
  const status = searchParams.get("status");   // AppointmentStatus value
  const customerId = searchParams.get("customerId");
  const petId = searchParams.get("petId");

  // Build where clause
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    where.scheduledAt = { gte: start, lte: end };
  }
  if (status && Object.values(AppointmentStatus).includes(status as AppointmentStatus)) {
    where.status = status as AppointmentStatus;
  }
  if (customerId) {
    where.customerId = customerId;
  }
  if (petId) {
    where.petId = petId;
  }

  const appointments = await prisma.appointment.findMany({
    where,
    include: APPOINTMENT_INCLUDE,
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json(appointments);
}

// POST /api/appointments
// Auth: staff only
// Body: { customerId, petId, scheduledAt, serviceType, appointmentType?, stationId?, staffId?, durationMins?, visitNotes? }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    customerId,
    petId,
    scheduledAt,
    serviceType,
    appointmentType,
    stationId,
    staffId,
    durationMins,
    visitNotes,
  } = body as Record<string, unknown>;

  if (!customerId || !petId || !scheduledAt || !serviceType) {
    return NextResponse.json(
      { error: "customerId, petId, scheduledAt, and serviceType are required" },
      { status: 400 }
    );
  }

  if (!Object.values(ServiceType).includes(serviceType as ServiceType)) {
    return NextResponse.json({ error: "Invalid serviceType" }, { status: 400 });
  }

  const parsedScheduledAt = new Date(scheduledAt as string);
  if (isNaN(parsedScheduledAt.getTime())) {
    return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
  }

  // Verify customer and pet exist
  const [customer, pet] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId as string } }),
    prisma.pet.findUnique({ where: { id: petId as string } }),
  ]);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }
  if (pet.customerId !== customerId) {
    return NextResponse.json({ error: "Pet does not belong to this customer" }, { status: 400 });
  }

  const resolvedType =
    appointmentType && Object.values(AppointmentType).includes(appointmentType as AppointmentType)
      ? (appointmentType as AppointmentType)
      : AppointmentType.APPOINTMENT;

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        customerId: customerId as string,
        petId: petId as string,
        scheduledAt: parsedScheduledAt,
        serviceType: serviceType as ServiceType,
        appointmentType: resolvedType,
        stationId: (stationId as string | undefined) ?? null,
        staffId: (staffId as string | undefined) ?? null,
        durationMins: durationMins != null ? Number(durationMins) : null,
        visitNotes: (visitNotes as string | undefined) ?? null,
        status: AppointmentStatus.SCHEDULED,
      },
      include: APPOINTMENT_INCLUDE,
    });

    // Create initial status history entry
    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId: created.id,
        status: AppointmentStatus.SCHEDULED,
        changedById: session.user.userType === "staff" ? session.user.id : null,
        note: "Appointment created",
      },
    });

    return created;
  });

  return NextResponse.json(appointment, { status: 201 });
}
