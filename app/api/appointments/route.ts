import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppointmentStatus, AppointmentType, Prisma, ServiceType } from "@prisma/client";
import { parseBody, parseOrBadRequest } from "@/lib/api-validation";
import { resolveSelectedServices } from "@/lib/appointment-services";
import { bookingRateSnapshot } from "@/lib/pricing-tiers";
import { serviceFloorCents } from "@/lib/pricing";
import { shopDayRangeForKey } from "@/lib/utils";

const APPOINTMENT_INCLUDE = {
  pet: true,
  customer: true,
  station: true,
  staff: true,
  statusHistory: { orderBy: { changedAt: "asc" as const } },
} as const;

const ListQuery = z.object({
  // A shop-local calendar day, not a UTC one — see shopDayRangeForKey.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD").nullish(),
  status: z.nativeEnum(AppointmentStatus).nullish(),
  customerId: z.string().min(1).nullish(),
  petId: z.string().min(1).nullish(),
});

const CreateBody = z
  .object({
    customerId: z.string().min(1),
    petId: z.string().min(1),
    scheduledAt: z.coerce.date(),
    // Catalog ids are the real booking input; serviceType alone is accepted so
    // an older caller keeps working, and is resolved to a catalog row below.
    serviceIds: z.array(z.string().min(1)).nonempty().optional(),
    serviceType: z.nativeEnum(ServiceType).optional(),
    appointmentType: z.nativeEnum(AppointmentType).default(AppointmentType.APPOINTMENT),
    stationId: z.string().min(1).nullish(),
    staffId: z.string().min(1).nullish(),
    durationMins: z.number().int().positive().nullish(),
    visitNotes: z.string().nullish(),
  })
  .refine((body) => body.serviceIds != null || body.serviceType != null, {
    message: "either serviceIds or serviceType is required",
    path: ["serviceIds"],
  });

// GET /api/appointments
// Auth: staff only
// Query params: date (shop-local YYYY-MM-DD), status, customerId, petId
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = parseOrBadRequest(ListQuery, {
    date: searchParams.get("date"),
    status: searchParams.get("status"),
    customerId: searchParams.get("customerId"),
    petId: searchParams.get("petId"),
  });
  if ("response" in parsed) return parsed.response;
  const query = parsed.data;

  const where: Prisma.AppointmentWhereInput = {};

  if (query.date) {
    // The shop's day, not the server's: a UTC window would open at 5pm the
    // previous afternoon in Phoenix and drop the evening off the end.
    const range = shopDayRangeForKey(query.date);
    if (!range) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    where.scheduledAt = { gte: range.start, lt: range.end };
  }
  if (query.status) where.status = query.status;
  if (query.customerId) where.customerId = query.customerId;
  if (query.petId) where.petId = query.petId;

  const appointments = await prisma.appointment.findMany({
    where,
    include: APPOINTMENT_INCLUDE,
    orderBy: { scheduledAt: "asc" },
  });

  return NextResponse.json(appointments);
}

// POST /api/appointments
// Auth: staff only
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.userType !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseBody(req, CreateBody);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const [customer, pet] = await Promise.all([
    prisma.customer.findUnique({ where: { id: body.customerId } }),
    prisma.pet.findUnique({ where: { id: body.petId } }),
  ]);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (!pet) {
    return NextResponse.json({ error: "Pet not found" }, { status: 404 });
  }
  if (pet.customerId !== body.customerId) {
    return NextResponse.json({ error: "Pet does not belong to this customer" }, { status: 400 });
  }

  // A missing station or groomer is a bad request, not a foreign-key crash.
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

  const resolved = await resolveSelectedServices(body.serviceIds ?? []);
  if (body.serviceIds && !resolved) {
    return NextResponse.json({ error: "No such services" }, { status: 400 });
  }

  // A visit carries line items or it is invisible to the service mix and to
  // revenue. When only a legacy serviceType was sent, stand in the catalog row
  // for that type — the same fallback the walk-in route uses.
  // serviceId is nullable on the line: a shop can retire a catalog row while
  // visits that used it stay on the books.
  let lines: {
    serviceId: string | null;
    serviceType: ServiceType;
    priceCents: number | null;
    sortOrder: number;
  }[] = resolved?.lines ?? [];
  const serviceType = resolved?.primaryType ?? body.serviceType!;

  if (lines.length === 0) {
    const catalogService = await prisma.service.findFirst({
      where: { type: serviceType, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    lines = [
      {
        serviceId: catalogService?.id ?? null,
        serviceType,
        priceCents: catalogService ? serviceFloorCents(catalogService) : null,
        sortOrder: 0,
      },
    ];
  }

  // Snapshot the customer's negotiated rate onto the visit, so editing the
  // tier later never reprices what was quoted here.
  const rate = await bookingRateSnapshot(body.customerId, lines);

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        customerId: body.customerId,
        petId: body.petId,
        scheduledAt: body.scheduledAt,
        serviceType,
        appointmentType: body.appointmentType,
        stationId: body.stationId ?? null,
        staffId: body.staffId ?? null,
        durationMins: body.durationMins ?? resolved?.totalDurationMins ?? null,
        visitNotes: body.visitNotes ?? null,
        status: AppointmentStatus.SCHEDULED,
        pricingTierId: rate.pricingTierId,
        pricingDiscountCents: rate.pricingDiscountCents,
        services: { create: lines },
      },
      include: APPOINTMENT_INCLUDE,
    });

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
