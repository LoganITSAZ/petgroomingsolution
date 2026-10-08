import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { FINISHED_STATUSES } from "@/lib/analytics";
import { guidesForBreeds } from "@/lib/breeds";
import { foldRedoMins } from "@/lib/groomer-fit";
import type { Insight } from "@/lib/insights";
import {
  PRICE_WINDOW_DAYS,
  breedGroup,
  moneyPerHour,
  priceInsights,
  type MoneyPerHour,
  type PricedVisit,
} from "@/lib/money-per-minute";
import { isSizePriced } from "@/lib/pricing";
import { ticketFor } from "@/lib/ticket";
import { visitTime, workedMins } from "@/lib/visit-time";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Finished visits in the window as the pure half wants them. One query — the
 * history, lines, surcharges and breed ride along — and one breed-guide lookup
 * for every breed at once.
 */
export async function pricedVisits(rangeDays: number, now: Date = new Date()): Promise<PricedVisit[]> {
  const since = new Date(now.getTime() - rangeDays * DAY_MS);
  const visits = await prisma.appointment.findMany({
    where: { status: { in: FINISHED_STATUSES }, scheduledAt: { gte: since, lte: now }, redoOfId: null },
    select: {
      statusHistory: { select: { status: true, changedAt: true } },
      services: {
        select: {
          priceCents: true,
          sizeTier: true,
          service: {
            select: {
              id: true,
              name: true,
              priceSmallCents: true,
              priceMediumCents: true,
              priceLargeCents: true,
              priceXlCents: true,
              priceFlatCents: true,
              priceMaxCents: true,
            },
          },
        },
      },
      appointmentSurcharges: { select: { amountCents: true } },
      // A redo is not a cheap visit: its time belongs to the one it fixes.
      redos: {
        where: { status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] } },
        select: { statusHistory: { select: { status: true, changedAt: true } } },
      },
      pet: { select: { breed: true } },
    },
  });

  const guides = await guidesForBreeds(visits.map((visit) => visit.pet.breed));

  return visits.flatMap((visit): PricedVisit[] => {
    const worked = foldRedoMins(
      workedMins(visitTime(visit.statusHistory, now)),
      visit.redos.map((redo) => workedMins(visitTime(redo.statusHistory, now)))
    );
    if (worked == null) return [];
    // Before discounts, and never the tip: see lib/money-per-minute.ts.
    const ticket = ticketFor({
      services: visit.services,
      surcharges: visit.appointmentSurcharges,
      tierDiscountCents: 0,
      rewardDiscountCents: 0,
      payments: [],
    });
    const guide = visit.pet.breed ? guides.get(visit.pet.breed.trim().toLowerCase()) : undefined;
    const breed = breedGroup(visit.pet.breed, guide?.breed ?? null);
    return [
      {
        workedMins: worked,
        ticketCents: ticket.serviceCents + ticket.surchargeCents,
        lines: visit.services.map((line) => ({
          serviceId: line.service?.id ?? null,
          serviceName: line.service?.name ?? null,
          sizeTier: line.sizeTier,
          sizePriced: line.service ? isSizePriced(line.service) : false,
          priceCents: line.priceCents,
        })),
        breedKey: breed?.key ?? null,
        breedLabel: breed?.label ?? null,
      },
    ];
  });
}

export async function moneyPerHourSummary(rangeDays: number, now: Date = new Date()): Promise<MoneyPerHour> {
  return moneyPerHour(await pricedVisits(rangeDays, now), rangeDays);
}

export async function priceInsightsNow(now: Date = new Date()): Promise<Insight[]> {
  return priceInsights(await moneyPerHourSummary(PRICE_WINDOW_DAYS, now));
}
