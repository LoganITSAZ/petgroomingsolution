/**
 * What was done to the pet, and what the owner agreed to.
 *
 * Two small things a shop keeps on the visit rather than the pet: the **groom
 * record** — the blade, the shampoo and whatever the groomer wants the next
 * one to know — and the **consent** given when a groom cannot be finished as
 * booked. Both are per-visit snapshots: a coat that was shaved in June is not
 * an instruction for September, and an owner who agreed to one shave-down has
 * not agreed to the next.
 *
 * The arithmetic here has no database in it so it can be tested directly —
 * same shape as lib/kennels.ts. The queries that feed it sit at the bottom.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/** The parts of a visit that make up a groom record. */
export interface GroomRecord {
  groomBlade: string | null;
  groomShampoo: string | null;
  groomRecordNotes: string | null;
}

/** A groom record plus enough to know which visit it came from. */
export interface DatedGroomRecord extends GroomRecord {
  id: string;
  completedAt: Date | null;
  scheduledAt: Date;
}

export interface ConsentTimestamps {
  consentRequestedAt: Date | null;
  consentGrantedAt: Date | null;
  consentDeclinedAt: Date | null;
}

/**
 * Where the owner's answer stands.
 *
 * `none` — nobody has asked. `pending` — asked, nothing back yet.
 *
 * An answer outranks a request, because a groomer who catches the owner at the
 * door never presses "ask", and the later of two answers wins: the counter is
 * regularly told one thing on the phone and another in person, and the shop
 * acts on the last thing it heard.
 */
export type ConsentState = "none" | "pending" | "granted" | "declined";

export function consentState(visit: ConsentTimestamps): ConsentState {
  const granted = visit.consentGrantedAt?.getTime() ?? null;
  const declined = visit.consentDeclinedAt?.getTime() ?? null;

  if (granted != null && declined != null) return granted >= declined ? "granted" : "declined";
  if (granted != null) return "granted";
  if (declined != null) return "declined";
  return visit.consentRequestedAt ? "pending" : "none";
}

/** Whether anything was actually written down. Whitespace is not a record. */
export function hasGroomRecord(record: GroomRecord): boolean {
  return groomRecordParts(record).length > 0;
}

function groomRecordParts(record: GroomRecord): string[] {
  return [record.groomBlade, record.groomShampoo, record.groomRecordNotes]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);
}

/** One line for a list or a station card. Empty when there is no record. */
export function groomRecordSummary(record: GroomRecord): string {
  return groomRecordParts(record).join(" · ");
}

/**
 * The most recent visit carrying a record, out of whatever was handed in.
 *
 * Sorts rather than trusting the caller's order, and dates an unfinished visit
 * by when it was booked: a groom abandoned halfway still had a blade on it,
 * and that is the most recent thing anyone knows about the coat.
 */
export function pickLastGroomRecord<T extends DatedGroomRecord>(visits: T[]): T | null {
  const withRecord = visits.filter(hasGroomRecord);
  if (withRecord.length === 0) return null;

  const at = (visit: T) => (visit.completedAt ?? visit.scheduledAt).getTime();
  return withRecord.reduce((latest, visit) => (at(visit) > at(latest) ? visit : latest));
}

const RECORD_SELECT = {
  id: true,
  completedAt: true,
  scheduledAt: true,
  groomBlade: true,
  groomShampoo: true,
  groomRecordNotes: true,
} as const;

/**
 * Most visits carry no record at all, so the filtering is left to Postgres
 * rather than dragging a pet's whole history back to compare it here.
 */
const HAS_RECORD: Prisma.AppointmentWhereInput = {
  OR: [
    { groomBlade: { not: null } },
    { groomShampoo: { not: null } },
    { groomRecordNotes: { not: null } },
  ],
};

/**
 * What this pet was last groomed with, ignoring the visit in hand.
 *
 * Bounded to the last handful of visits: the answer is almost always the
 * previous one, and a pet on the books for years should not drag its whole
 * history onto a station screen.
 */
export async function lastGroomRecordForPet(
  petId: string,
  exceptAppointmentId?: string
): Promise<DatedGroomRecord | null> {
  const visits = await prisma.appointment.findMany({
    where: {
      petId,
      id: exceptAppointmentId ? { not: exceptAppointmentId } : undefined,
      ...HAS_RECORD,
    },
    select: RECORD_SELECT,
    orderBy: { scheduledAt: "desc" },
    take: 5,
  });
  return pickLastGroomRecord(visits);
}

/** The same answer for several pets at once — one query for a station board. */
export async function lastGroomRecordsForPets(
  petIds: string[]
): Promise<Map<string, DatedGroomRecord>> {
  const unique = [...new Set(petIds)];
  if (unique.length === 0) return new Map();

  const visits = await prisma.appointment.findMany({
    where: { petId: { in: unique }, ...HAS_RECORD },
    select: { ...RECORD_SELECT, petId: true },
    orderBy: { scheduledAt: "desc" },
  });

  const byPet = new Map<string, DatedGroomRecord>();
  for (const petId of unique) {
    const record = pickLastGroomRecord(visits.filter((visit) => visit.petId === petId));
    if (record) byPet.set(petId, record);
  }
  return byPet;
}
