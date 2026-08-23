import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToStation } from "@/lib/station-events";
import { sendReadyForPickup } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";

const schema = z.object({
  status: z.nativeEnum(AppointmentStatus),
  note: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { status, note } = parsed.data;

  // Load current appointment
  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    include: {
      pet: true,
      customer: { select: { email: true, firstName: true, lastName: true } },
      station: true,
    },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Update status + timestamps
  const now = new Date();
  const updated = await prisma.appointment.update({
    where: { id: params.id },
    data: {
      status,
      checkedInAt: status === "CHECKED_IN" ? now : undefined,
      completedAt: status === "COMPLETE" ? now : undefined,
      statusHistory: {
        create: {
          status,
          note,
          changedById: session.user.id,
        },
      },
    },
    include: {
      pet: true,
      customer: { select: { firstName: true, lastName: true, phone: true, email: true } },
      staff: { select: { name: true } },
      station: true,
    },
  });

  // Broadcast to station display
  if (updated.stationId) {
    broadcastToStation(updated.stationId, {
      type: "status_update",
      appointment: updated,
      station: updated.station,
    });
  }

  // Send ready-for-pickup email
  if (status === "READY_PICKUP" && updated.customer.email) {
    await sendReadyForPickup({
      to: updated.customer.email,
      ownerName: `${updated.customer.firstName} ${updated.customer.lastName}`,
      petName: updated.pet.name,
    }).catch(console.error); // don't fail the request if email fails
  }

  return NextResponse.json(updated);
}
