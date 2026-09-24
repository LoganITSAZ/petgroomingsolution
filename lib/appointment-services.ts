import { prisma } from "@/lib/prisma";
import { quoteLine, serviceFloorCents } from "@/lib/pricing";
import { sizeCutoffs, sizePet, type PetSize, type SizedPet } from "@/lib/pet-size";
import { guidesForBreeds } from "@/lib/breeds";
import type { ServiceOption } from "@/components/ServicePicker";
import { Species, type ServiceType } from "@prisma/client";
import { getConfig } from "@/lib/config";
import { sendBookingConfirmation } from "@/lib/email";
import { smsBookingConfirmation } from "@/lib/sms";
import { formatServiceType, formatShopDate, formatShopTime } from "@/lib/utils";

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
    sizeTier: PetSize | null;
    sortOrder: number;
  }[];
}

/** A pet's size for quoting, from its own weight or its breed's. */
export async function sizePetById(petId: string): Promise<SizedPet | null> {
  const pet = await prisma.pet.findUnique({
    where: { id: petId },
    select: { species: true, breed: true, weightLbs: true },
  });
  if (!pet) return null;
  const [config, guides] = await Promise.all([getConfig(), guidesForBreeds([pet.breed])]);
  const guide = pet.breed ? guides.get(pet.breed.trim().toLowerCase()) : undefined;
  return sizePet(pet, guide, sizeCutoffs(config));
}

/**
 * Turn selected catalog ids into line items, in the order they were picked.
 * The same catalog row cannot be added twice; two different services that
 * share a reporting type (a dog groom and a cat groom are both FULL_GROOM) can
 * both be booked. Unknown ids are dropped. With a pet, size-priced lines are
 * quoted at that pet's size.
 */
export async function resolveSelectedServices(
  serviceIds: string[],
  petId?: string | null
): Promise<ResolvedServices | null> {
  const ids = serviceIds.map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) return null;

  const [services, sized] = await Promise.all([
    prisma.service.findMany({ where: { id: { in: ids } } }),
    petId ? sizePetById(petId) : null,
  ]);
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
      ...quoteLine(service, sized?.size ?? null),
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
 * Tell the customer their booking landed, by whichever channels the shop runs.
 *
 * Email and SMS are gated separately — the shop switches each on by itself, so
 * neither early-returns on the other's flag. Notification failures never fail a
 * booking.
 */
export async function sendBookingNotifications(appointmentId: string): Promise<void> {
  const [config, appointment] = await Promise.all([
    getConfig(),
    prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        pet: { select: { name: true } },
        customer: {
          select: { email: true, phone: true, firstName: true, lastName: true, smsOptOut: true },
        },
        services: { include: { service: true }, orderBy: { sortOrder: "asc" } },
      },
    }),
  ]);

  if (!appointment) return;

  const serviceNames = appointment.services
    .map((line) => line.service?.name ?? formatServiceType(line.serviceType))
    .join(", ");

  if (config.featureEmailNotify && appointment.customer.email) {
    await sendBookingConfirmation({
      to: appointment.customer.email,
      ownerName: `${appointment.customer.firstName} ${appointment.customer.lastName}`,
      petName: appointment.pet.name,
      scheduledAt: appointment.scheduledAt,
      serviceType: serviceNames || formatServiceType(appointment.serviceType),
    }).catch(console.error);
  }

  if (appointment.customer.phone && !appointment.customer.smsOptOut) {
    await smsBookingConfirmation({
      to: appointment.customer.phone,
      petName: appointment.pet.name,
      shopName: config.shopName,
      // Shop wall clock, like everything else the customer is told.
      when: `${formatShopDate(appointment.scheduledAt)} at ${formatShopTime(appointment.scheduledAt)}`,
    }).catch(console.error);
  }
}
