import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { VisitEventType } from "@prisma/client";

// POST /api/appointments/[id]/events
// Auth: staff only
// Body: { eventType: VisitEventType, note?: string, ownerVisible?: boolean }
// If eventType === "BITE", also flags pet.hasBiteHistory = true
export async function POST(
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

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    select: { id: true, petId: true },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { eventType, note, ownerVisible } = body as Record<string, unknown>;

  if (!eventType) {
    return NextResponse.json({ error: "eventType is required" }, { status: 400 });
  }

  if (!Object.values(VisitEventType).includes(eventType as VisitEventType)) {
    return NextResponse.json(
      {
        error: "Invalid eventType",
        validValues: Object.values(VisitEventType),
      },
      { status: 400 }
    );
  }

  const visitEvent = await prisma.$transaction(async (tx) => {
    const created = await tx.visitEvent.create({
      data: {
        appointmentId: id,
        eventType: eventType as VisitEventType,
        note: (note as string | undefined) ?? null,
        // Opt-in, and only a real boolean counts: this decides whether the
        // owner is told, which is not something a stray truthy value should do.
        ownerVisible: ownerVisible === true,
        loggedById: session.user.id,
      },
      include: {
        loggedBy: { select: { id: true, name: true } },
        appointment: { select: { id: true, petId: true } },
      },
    });

    // Flag bite history on the pet
    if (eventType === VisitEventType.BITE) {
      await tx.pet.update({
        where: { id: appointment.petId },
        data: { hasBiteHistory: true },
      });
    }

    return created;
  });

  return NextResponse.json(visitEvent, { status: 201 });
}
