import { AppointmentStatus, StaffRole, type BreedGuide } from "@prisma/client";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { guidesForBreeds } from "@/lib/breeds";
import {
  FIT_WINDOW_DAYS,
  bookingGroomer,
  errorCauses,
  fitInsights,
  foldRedoMins,
  strengthRows,
  type FitSample,
  type GroomerPick,
  type StrengthAxis,
  type StrengthRow,
} from "@/lib/groomer-fit";
import type { Insight } from "@/lib/insights";
import { prisma } from "@/lib/prisma";
import { visitTime, workedMins } from "@/lib/visit-time";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A redo the shop cancelled, or the owner never brought in, fixed nothing and cost nothing. */
const LIVE_REDO = { status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] } };

export function guideIdFor(guides: Map<string, BreedGuide>, breed: string | null): string | null {
  return breed ? (guides.get(breed.trim().toLowerCase())?.id ?? null) : null;
}

/**
 * The window's finished visits as the pure half wants them. One query and one
 * breed-guide lookup. A redo is never a sample: its minutes and its error
 * belong to the visit it fixes.
 */
// ponytail: loads 12 months on every booking and dashboard load; cache per request if it shows up in timings.
export async function fitSamples(now: Date = new Date()): Promise<FitSample[]> {
  const since = new Date(now.getTime() - FIT_WINDOW_DAYS * DAY_MS);
  const visits = await prisma.appointment.findMany({
    where: { status: { in: FINISHED_STATUSES }, scheduledAt: { gte: since, lte: now }, redoOfId: null },
    select: {
      id: true,
      petId: true,
      staffId: true,
      serviceType: true,
      scheduledAt: true,
      completedAt: true,
      statusHistory: { select: { status: true, changedAt: true, changedById: true }, orderBy: { changedAt: "asc" } },
      visitEvents: { select: { eventType: true } },
      redos: { where: LIVE_REDO, select: { statusHistory: { select: { status: true, changedAt: true } } } },
      services: { select: { sizeTier: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      pet: { select: { breed: true, coatType: true } },
    },
  });
  const guides = await guidesForBreeds(visits.map((visit) => visit.pet.breed));

  return visits.flatMap((visit): FitSample[] => {
    // Same credit rule as Analytics: the assigned groomer, else whoever finished it.
    const finish = visit.statusHistory.find((row) => FINISHED_STATUSES.includes(row.status));
    const staffId = visit.staffId ?? finish?.changedById ?? null;
    if (!staffId) return [];
    const guide = visit.pet.breed ? guides.get(visit.pet.breed.trim().toLowerCase()) : undefined;
    return [
      {
        appointmentId: visit.id,
        staffId,
        petId: visit.petId,
        guideId: guide?.id ?? null,
        guideName: guide?.breed ?? null,
        serviceType: visit.serviceType,
        sizeTier: visit.services[0]?.sizeTier ?? null,
        coatType: visit.pet.coatType,
        finishedAt: visit.completedAt ?? finish?.changedAt ?? visit.scheduledAt,
        workedMins: foldRedoMins(
          workedMins(visitTime(visit.statusHistory, now)),
          visit.redos.map((redo) => workedMins(visitTime(redo.statusHistory, now)))
        ),
        errors: errorCauses({
          eventTypes: visit.visitEvents.map((event) => event.eventType),
          history: visit.statusHistory,
          redoVisits: visit.redos.length,
        }),
      },
    ];
  });
}

/** Who a booking may go to — the same people the assignment dropdowns offer. */
export async function activeGroomers(): Promise<{ id: string; name: string }[]> {
  return prisma.staff.findMany({
    where: { isActive: true, roles: { hasSome: [StaffRole.GROOMER, StaffRole.BATHER] } },
    select: { id: true, name: true },
  });
}

export async function bookingGroomerFor(petId: string, serviceType: string, now: Date = new Date()): Promise<GroomerPick | null> {
  const [pet, candidates, samples] = await Promise.all([
    prisma.pet.findUnique({
      where: { id: petId },
      select: { breed: true, customer: { select: { preferredStaffId: true } } },
    }),
    activeGroomers(),
    fitSamples(now),
  ]);
  if (!pet) return null;
  const guides = await guidesForBreeds([pet.breed]);
  return bookingGroomer(
    {
      petId,
      guideId: guideIdFor(guides, pet.breed),
      serviceType,
      preferredStaffId: pet.customer.preferredStaffId,
      candidates,
    },
    samples
  );
}

/** Insights about people who still work here. */
export async function fitInsightsNow(now: Date = new Date()): Promise<Insight[]> {
  const [samples, staff] = await Promise.all([fitSamples(now), activeGroomers()]);
  const names = new Map(staff.map((s) => [s.id, s.name]));
  return fitInsights(samples.filter((s) => names.has(s.staffId)), names);
}

/** Only when the evidence names somebody other than the owner's choice. */
export async function petFitInsights(petId: string, now: Date = new Date()): Promise<Insight[]> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: {
      name: true,
      customer: { select: { preferredStaff: { select: { id: true, name: true } } } },
      appointments: {
        where: { status: { in: FINISHED_STATUSES } },
        orderBy: { scheduledAt: "desc" },
        take: 1,
        select: { serviceType: true },
      },
    },
  });
  const preferred = pet?.customer.preferredStaff;
  const serviceType = pet?.appointments[0]?.serviceType;
  if (!pet || !preferred || !serviceType) return [];

  const pick = await bookingGroomerFor(petId, serviceType, now);
  if (!pick || pick.staffId === preferred.id) return [];
  return [
    {
      id: `pet-fit:${petId}`,
      tone: "opportunity",
      title: `${pick.staffName} is the better fit for ${pet.name}`,
      detail: `The owner prefers ${preferred.name}. New bookings go to ${pick.staffName} unless staff choose otherwise.`,
      evidence: pick.reason,
    },
  ];
}

export async function groomerStrengths(now: Date = new Date()): Promise<Record<StrengthAxis, StrengthRow[]>> {
  const [samples, staff] = await Promise.all([fitSamples(now), activeGroomers()]);
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const mine = samples.filter((s) => names.has(s.staffId));
  return {
    breed: strengthRows(mine, names, "breed"),
    size: strengthRows(mine, names, "size"),
    coat: strengthRows(mine, names, "coat"),
  };
}
