import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppointmentStatus, AppointmentType, Prisma, ServiceType } from "@prisma/client";
import { parseBody, parseOrBadRequest } from "@/lib/api-validation";
import { APPOINTMENT_INCLUDE, createAppointment } from "@/lib/create-appointment";
import { shopDayRangeForKey } from "@/lib/utils";

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

  const result = await createAppointment({
    customerId: body.customerId,
    petId: body.petId,
    scheduledAt: body.scheduledAt,
    serviceIds: body.serviceIds,
    serviceType: body.serviceType,
    appointmentType: body.appointmentType,
    stationId: body.stationId ?? undefined,
    staffId: body.staffId ?? undefined,
    durationMins: body.durationMins,
    visitNotes: body.visitNotes,
    // Staff-only route: skip the lead time and booking window.
    enforceCustomerRules: false,
    changedById: session.user.id,
  });

  if (!result.ok) {
    // NOT_FOUND is the only 404 here; everything else is the caller sending a
    // time or a pet the shop cannot take.
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json(result.appointment, { status: 201 });
}
