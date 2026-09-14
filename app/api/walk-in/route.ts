import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAppointment } from "@/lib/create-appointment";
import { getConfig } from "@/lib/config";
import { currentShopTime, isWithinWalkInWindow } from "@/lib/utils";
import { NextResponse } from "next/server";
import { AppointmentStatus, AppointmentType, ServiceType } from "@prisma/client";
import { z } from "zod";
import { parseBody } from "@/lib/api-validation";

const CreateBody = z.object({
  customerId: z.string().min(1),
  petId: z.string().min(1),
  serviceType: z.nativeEnum(ServiceType),
});

// POST /api/walk-in
// Creates a walk-in appointment if the walk-in portal is enabled and the
// current time falls within the configured walk-in window.
// Body: { customerId, petId, serviceType }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getConfig();

  // Feature flag check
  if (!config.featureWalkInPortal) {
    return NextResponse.json(
      { error: "Walk-in portal is currently disabled" },
      { status: 403 }
    );
  }

  // Time window check — evaluated in the shop's timezone, not the server's.
  const now = new Date();
  const windowStart = config.walkInWindowStart; // e.g. "09:00"
  const windowEnd = config.walkInWindowEnd;     // e.g. "15:00"
  const currentHHMM = currentShopTime(now);

  if (!isWithinWalkInWindow(windowStart, windowEnd, now)) {
    return NextResponse.json(
      {
        error: `Walk-in check-in is only available between ${windowStart} and ${windowEnd}`,
        windowStart,
        windowEnd,
        currentTime: currentHHMM,
      },
      { status: 422 }
    );
  }

  const parsed = await parseBody(req, CreateBody);
  if ("response" in parsed) return parsed.response;
  const { customerId, petId, serviceType } = parsed.data;

  // Customers can only create walk-ins for themselves
  if (session.user.userType === "customer" && session.user.id !== customerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify customer and pet
  const [customer, pet] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId } }),
    prisma.pet.findUnique({ where: { id: petId } }),
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

  const result = await createAppointment({
    customerId,
    petId,
    scheduledAt: now,
    serviceType,
    appointmentType: AppointmentType.WALK_IN,
    // A walk-in is already here: it gets a groomer and a station like any
    // other visit, which it never did before.
    status: AppointmentStatus.CHECKED_IN,
    enforceCustomerRules: false,
    changedById: session.user.userType === "staff" ? session.user.id : null,
    note: "Walk-in check-in via portal",
  });

  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json({ error: result.message, code: result.code }, { status });
  }

  return NextResponse.json(result.appointment, { status: 201 });
}
