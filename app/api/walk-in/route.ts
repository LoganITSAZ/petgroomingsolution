import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serviceFloorCents } from "@/lib/pricing";
import { bookingRateSnapshot } from "@/lib/pricing-tiers";
import { getConfig } from "@/lib/config";
import { currentShopTime, isWithinWalkInWindow } from "@/lib/utils";
import { NextResponse } from "next/server";
import { AppointmentStatus, AppointmentType, ServiceType } from "@prisma/client";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { customerId, petId, serviceType } = body as Record<string, unknown>;

  if (!customerId || !petId || !serviceType) {
    return NextResponse.json(
      { error: "customerId, petId, and serviceType are required" },
      { status: 400 }
    );
  }

  if (!Object.values(ServiceType).includes(serviceType as ServiceType)) {
    return NextResponse.json({ error: "Invalid serviceType" }, { status: 400 });
  }

  // Customers can only create walk-ins for themselves
  if (
    session.user.userType === "customer" &&
    session.user.id !== customerId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify customer and pet
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

  // Walk-ins need a line item like any other visit, or they are invisible to
  // the service mix and revenue figures in analytics.
  const catalogService = await prisma.service.findFirst({
    where: { type: serviceType as ServiceType, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const linePriceCents = catalogService ? serviceFloorCents(catalogService) : null;
  // A walk-in is quoted the same negotiated rate as a booked visit.
  const rate = await bookingRateSnapshot(customerId as string, [{ priceCents: linePriceCents }]);

  const appointment = await prisma.$transaction(async (tx) => {
    const created = await tx.appointment.create({
      data: {
        customerId: customerId as string,
        petId: petId as string,
        scheduledAt: now,
        serviceType: serviceType as ServiceType,
        appointmentType: AppointmentType.WALK_IN,
        status: AppointmentStatus.CHECKED_IN,
        checkedInAt: now,
        pricingTierId: rate.pricingTierId,
        pricingDiscountCents: rate.pricingDiscountCents,
        services: {
          create: {
            serviceId: catalogService?.id ?? null,
            serviceType: serviceType as ServiceType,
            priceCents: linePriceCents,
            sortOrder: 0,
          },
        },
      },
      include: {
        pet: true,
        customer: true,
        station: true,
        staff: true,
      },
    });

    await tx.appointmentStatusHistory.create({
      data: {
        appointmentId: created.id,
        status: AppointmentStatus.CHECKED_IN,
        note: "Walk-in check-in via portal",
      },
    });

    return created;
  });

  return NextResponse.json(appointment, { status: 201 });
}
