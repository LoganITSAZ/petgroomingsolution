import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { changeAppointmentStatus } from "@/lib/appointment-status";
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

  const appointment = await prisma.appointment.findUnique({ where: { id: params.id } });
  if (!appointment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Audit row, station broadcast, kennel release and pickup email all live in
  // changeAppointmentStatus so every caller behaves identically.
  const updated = await changeAppointmentStatus({
    appointmentId: params.id,
    status: parsed.data.status,
    note: parsed.data.note,
    staffId: session.user.id,
  });

  return NextResponse.json(updated);
}
