import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Species, CoatType } from "@prisma/client";

const PET_INCLUDE_STAFF = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
} as const;

// GET /api/pets
// Staff: all active pets (with customer info), filterable by customerId query param
// Customer: only their own pets
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  if (session.user.userType === "customer") {
    const pets = await prisma.pet.findMany({
      where: { customerId: session.user.id, isActive: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(pets);
  }

  // Staff: can filter by customerId
  const customerId = searchParams.get("customerId");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { isActive: true };
  if (customerId) where.customerId = customerId;

  const pets = await prisma.pet.findMany({
    where,
    include: PET_INCLUDE_STAFF,
    orderBy: [{ customer: { lastName: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json(pets);
}

// POST /api/pets
// Staff can create for any customerId. Customer creates only for themselves.
// Body: { name, customerId?, species?, breed?, dateOfBirth?, weightLbs?, coatType?,
//         temperamentNotes?, healthFlags?, groomingNotes?, photoUrl? }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name,
    customerId: bodyCustomerId,
    species,
    breed,
    dateOfBirth,
    weightLbs,
    coatType,
    temperamentNotes,
    healthFlags,
    groomingNotes,
    photoUrl,
  } = body as Record<string, unknown>;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Resolve the target customerId
  let targetCustomerId: string;
  if (session.user.userType === "customer") {
    // Customers always create pets for themselves
    targetCustomerId = session.user.id;
  } else {
    // Staff must supply a customerId
    if (!bodyCustomerId || typeof bodyCustomerId !== "string") {
      return NextResponse.json({ error: "customerId is required" }, { status: 400 });
    }
    targetCustomerId = bodyCustomerId;
  }

  // Verify the customer exists
  const customer = await prisma.customer.findUnique({
    where: { id: targetCustomerId },
    select: { id: true, isActive: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (!customer.isActive) {
    return NextResponse.json({ error: "Customer account is inactive" }, { status: 400 });
  }

  // Validate enums
  if (species && !Object.values(Species).includes(species as Species)) {
    return NextResponse.json({ error: "Invalid species" }, { status: 400 });
  }
  if (coatType && !Object.values(CoatType).includes(coatType as CoatType)) {
    return NextResponse.json({ error: "Invalid coatType" }, { status: 400 });
  }

  let parsedDob: Date | undefined;
  if (dateOfBirth) {
    parsedDob = new Date(dateOfBirth as string);
    if (isNaN(parsedDob.getTime())) {
      return NextResponse.json({ error: "Invalid dateOfBirth" }, { status: 400 });
    }
  }

  const pet = await prisma.pet.create({
    data: {
      customerId: targetCustomerId,
      name: (name as string).trim(),
      species: (species as Species | undefined) ?? Species.DOG,
      breed: (breed as string | undefined) ?? null,
      dateOfBirth: parsedDob ?? null,
      weightLbs: weightLbs != null ? Number(weightLbs) : null,
      coatType: (coatType as CoatType | undefined) ?? null,
      temperamentNotes: (temperamentNotes as string | undefined) ?? null,
      healthFlags: Array.isArray(healthFlags) ? (healthFlags as string[]) : [],
      groomingNotes: (groomingNotes as string | undefined) ?? null,
      photoUrl: (photoUrl as string | undefined) ?? null,
    },
    include:
      session.user.userType === "staff" ? PET_INCLUDE_STAFF : undefined,
  });

  return NextResponse.json(pet, { status: 201 });
}
