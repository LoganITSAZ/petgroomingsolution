import { prisma } from "@/lib/prisma";
import { serviceFloorCents } from "@/lib/pricing";
import type { ServiceOption } from "@/components/ServicePicker";
import { Species, type ServiceType } from "@prisma/client";
import { getConfig } from "@/lib/config";
import { sendBookingConfirmation } from "@/lib/email";
import { formatServiceType } from "@/lib/utils";

/**
 * A visit can carry several services. `Appointment.serviceType` stays the
 * primary one so existing screens and emails keep working; the full list lives
 * in `AppointmentService`.
 */

export interface ResolvedServices {
  primaryType: ServiceType;
  totalDurationMins: number | null;
  lines: {
    serviceId: string;
    serviceType: ServiceType;
    priceCents: number | null;
    sortOrder: number;
  }[];
}

/**
 * Turn selected catalog ids into line items, in the order they were picked.
 * The same catalog row cannot be added twice; two different services that
 * share a reporting type (a dog groom and a cat groom are both FULL_GROOM) can
 * both be booked. Unknown ids are dropped.
 */
export async function resolveSelectedServices(
  serviceIds: string[]
): Promise<ResolvedServices | null> {
  const ids = serviceIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return null;

  const services = await prisma.service.findMany({ where: { id: { in: ids } } });
  const byId = new Map(services.map((service) => [service.id, service]));

  const lines: ResolvedServices["lines"] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const service = byId.get(id);
    if (!service || seen.has(service.id)) continue;
    seen.add(service.id);
    lines.push({
      serviceId: service.id,
      serviceType: service.type,
      priceCents: serviceFloorCents(service),
      sortOrder: lines.length,
    });
  }

  if (lines.length === 0) return null;

  const durations = lines
    .map((line) => byId.get(line.serviceId)?.durationMins ?? null)
    .filter((mins): mins is number => mins != null);

  return {
    primaryType: lines[0].serviceType,
    totalDurationMins: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) : null,
    lines,
  };
}

/** Replace the line items on an appointment with the given selection. */
export async function setAppointmentServices(
  appointmentId: string,
  resolved: ResolvedServices
): Promise<void> {
  await prisma.$transaction([
    prisma.appointmentService.deleteMany({ where: { appointmentId } }),
    prisma.appointmentService.createMany({
      data: resolved.lines.map((line) => ({ ...line, appointmentId })),
    }),
  ]);
}

/**
 * Catalog options for the booking forms, grouped by who they are for and
 * flagged when a live promotion is attached.
 */
export async function getServiceOptions(now: Date = new Date()): Promise<ServiceOption[]> {
  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      promotions: {
        where: {
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
          ],
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return services.map((service) => {
    const group =
      service.species === Species.DOG
        ? "Dogs"
        : service.species === Species.CAT
          ? "Cats"
          : service.species === Species.OTHER
            ? "Other pets"
            : "Any pet";
    const promo = service.promotions[0];

    return {
      id: service.id,
      name: promo ? `${service.name} — ${promo.title}` : service.name,
      group,
      speciesOnly: service.species,
      priceCents: serviceFloorCents(service),
      durationMins: service.durationMins,
    };
  });
}

/**
 * Tell the customer their booking landed. Notification failures never fail a
 * booking, and the shop can switch email off entirely.
 */
export async function sendBookingEmail(appointmentId: string): Promise<void> {
  const [config, appointment] = await Promise.all([
    getConfig(),
    prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        pet: { select: { name: true } },
        customer: { select: { email: true, firstName: true, lastName: true } },
        services: { include: { service: true }, orderBy: { sortOrder: "asc" } },
      },
    }),
  ]);

  if (!config.featureEmailNotify || !appointment?.customer.email) return;

  const serviceNames = appointment.services
    .map((line) => line.service?.name ?? formatServiceType(line.serviceType))
    .join(", ");

  await sendBookingConfirmation({
    to: appointment.customer.email,
    ownerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
    petName: appointment.pet.name,
    scheduledAt: appointment.scheduledAt,
    serviceType: serviceNames || formatServiceType(appointment.serviceType),
  }).catch(console.error);
}
