import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageShell, PageSection } from "@/components/ui";
import CustomerPetFields from "../CustomerPetFields";
import { CoatType, PetSex, Species } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { defaultAssignment } from "@/lib/stations";
import { capacityConflicts, kennelAvailableFor } from "@/lib/kennels";
import { formatShopTime24, shopDayKey, shopDayRange } from "@/lib/utils";
import {
  getServiceOptions,
  resolveSelectedServices,
  sendBookingEmail,
  setAppointmentServices,
} from "@/lib/appointment-services";
import { bookingRateSnapshot } from "@/lib/pricing-tiers";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "New Appointment" };

interface PageProps {
  searchParams: Promise<{ customerId?: string; petId?: string }>;
}

export default async function NewStaffAppointmentPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session || session.user.userType !== "staff") {
    redirect("/login");
  }

  const { customerId, petId } = searchParams;

  const [customers, pets, serviceOptions] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { lastName: "asc" },
    }),
    prisma.pet.findMany({
      where: { isActive: true },
      select: { id: true, name: true, customerId: true, species: true },
      orderBy: { name: "asc" },
    }),
    getServiceOptions(),
  ]);

  // Default datetime: next full hour, at least 1 hour from now. The input is
  // shop wall clock, so it is formatted in SHOP_TIMEZONE — getTimezoneOffset()
  // is the server's, which is UTC in production.
  const defaultDt = new Date(new Date().getTime() + 60 * 60 * 1000);
  defaultDt.setMinutes(0, 0, 0);
  const defaultDtLocal = `${shopDayKey(defaultDt)}T${formatShopTime24(defaultDt)}`;

  async function createAppointment(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session || session.user.userType !== "staff") redirect("/login");

    const scheduledAt = formData.get("scheduledAt") as string;
    const appointmentType = formData.get("appointmentType") as string;

    const visitNotes = (formData.get("visitNotes") as string) || null;

    if (!appointmentType) {
      throw new Error("Missing required fields");
    }

    // Booking a pet that is standing at the counter should not require typing
    // a time: an empty field is stamped with the moment the record is saved.
    const scheduledFor = scheduledAt ? new Date(scheduledAt) : new Date();
    if (Number.isNaN(scheduledFor.getTime())) {
      throw new Error("That date and time could not be read");
    }

    const field = (name: string) => ((formData.get(name) as string | null) ?? "").trim();

    // Counter staff often book someone who has never been in, so registering
    // the owner and the pet is part of the booking.
    let customerId: string;
    if (formData.get("customerMode") === "new") {
      const firstName = field("newCustomerFirstName");
      const lastName = field("newCustomerLastName");
      const email = field("newCustomerEmail").toLowerCase();
      const password = field("newCustomerPassword");

      if (!firstName || !lastName || !email) {
        throw new Error("New customers need a first name, last name and email");
      }
      if (password && password.length < 8) {
        throw new Error("Portal passwords must be at least 8 characters");
      }
      if (await prisma.customer.findUnique({ where: { email } })) {
        throw new Error("A customer already uses that email address");
      }

      // No password means no portal sign-in: store an unusable random hash
      // rather than something guessable.
      const customer = await prisma.customer.create({
        data: {
          firstName,
          lastName,
          email,
          phone: field("newCustomerPhone") || null,
          passwordHash: await bcrypt.hash(password || randomBytes(32).toString("hex"), 12),
        },
      });
      customerId = customer.id;
    } else {
      customerId = field("customerId");
      if (!customerId) throw new Error("Pick a customer");
    }

    let petId: string;
    if (formData.get("petMode") === "new") {
      const name = field("newPetName");
      if (!name) throw new Error("The new pet needs a name");

      const weightRaw = field("newPetWeightLbs");
      const weightLbs = weightRaw ? Number(weightRaw) : null;
      if (weightLbs != null && (!Number.isFinite(weightLbs) || weightLbs <= 0)) {
        throw new Error("Weight has to be a positive number");
      }
      const speciesRaw = field("newPetSpecies");
      const coatRaw = field("newPetCoatType");

      const pet = await prisma.pet.create({
        data: {
          customerId,
          name,
          species: Object.values(Species).includes(speciesRaw as Species)
            ? (speciesRaw as Species)
            : Species.DOG,
          sex: Object.values(PetSex).includes(field("newPetSex") as PetSex)
            ? (field("newPetSex") as PetSex)
            : PetSex.UNKNOWN,
          breed: field("newPetBreed") || null,
          weightLbs,
          coatType: Object.values(CoatType).includes(coatRaw as CoatType)
            ? (coatRaw as CoatType)
            : null,
          groomingNotes: field("newPetGroomingNotes") || null,
        },
      });
      petId = pet.id;
    } else {
      petId = field("petId");
      if (!petId) throw new Error("Pick a pet");

      // The pet must belong to the customer the appointment is being booked for.
      const owned = await prisma.pet.findFirst({ where: { id: petId, customerId } });
      if (!owned) throw new Error("That pet belongs to a different customer");
    }

    // One visit, one or more services. The first pick is the primary service.
    const services = await resolveSelectedServices(
      formData.getAll("serviceIds").map((value) => String(value))
    );
    if (!services) throw new Error("Select at least one service");

    // Duration is the sum of the services booked, never typed in.
    const durationMins = services.totalDurationMins;

    // Every visit needs a kennel, so the day cannot promise more kennels than
    // the shop has.
    const { start, end } = shopDayRange(scheduledFor);
    const availability = await kennelAvailableFor(start, end);
    if (!availability.ok) {
      const conflicts = await capacityConflicts(start, end);
      const held = conflicts.overstaying.length;
      throw new Error(
        `Every kennel is spoken for that day (${availability.committed}/${availability.capacity})` +
          (held > 0
            ? ` — ${held} pet${held === 1 ? " is" : "s are"} waiting to be collected. Chase the pickups.`
            : ".")
      );
    }

    // Customers are attached to a groomer, and groomers to a station, so
    // neither is chosen here.
    const assignment = await defaultAssignment(customerId);
    // Customers on a negotiated rate are quoted it from the moment they book.
    const rate = await bookingRateSnapshot(customerId, services.lines);

    const appointment = await prisma.appointment.create({
      data: {
        customerId,
        petId,
        scheduledAt: scheduledFor,
        serviceType: services.primaryType,
        appointmentType: appointmentType as never,
        status: "SCHEDULED",
        stationId: assignment.stationId ?? undefined,
        staffId: assignment.staffId ?? undefined,
        durationMins: durationMins ?? undefined,
        needsKennel: true,
        visitNotes: visitNotes ?? undefined,
        pricingTierId: rate.pricingTierId,
        pricingDiscountCents: rate.pricingDiscountCents,
      },
    });

    await setAppointmentServices(appointment.id, services);
    await sendBookingEmail(appointment.id);

    await prisma.appointmentStatusHistory.create({
      data: {
        appointmentId: appointment.id,
        status: "SCHEDULED",
        changedById: session.user.id,
        note: "Appointment created by staff",
      },
    });

    redirect("/staff/appointments");
  }

  return (
    <PageShell
      back={{ href: "/staff/appointments", label: "Back to Appointments" }}
      title="New Appointment"
      className="max-w-2xl mx-auto w-full flex-none"
    >
      <PageSection>
        <form action={createAppointment} className="space-y-3">
          <CustomerPetFields
            customers={customers.map((customer) => ({
              id: customer.id,
              name: `${customer.lastName}, ${customer.firstName} — ${customer.email}`,
            }))}
            pets={pets}
            services={serviceOptions}
            defaultCustomerId={customerId ?? ""}
            defaultPetId={petId ?? ""}
          />

          {/* Date & Time */}
          <div>
            <label htmlFor="scheduledAt" className="block text-sm font-semibold text-stone-700 mb-1.5">
              Date &amp; Time
            </label>
            <input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              defaultValue={defaultDtLocal}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800"
            />
            <p className="text-xs text-stone-400 mt-1">
              Clear it to stamp the time the appointment is saved — for someone already at the
              counter.
            </p>
          </div>

          {/* Appointment Type */}
          <div>
            <span className="block text-sm font-semibold text-stone-700 mb-2">
              Appointment Type <span className="text-red-700">*</span>
            </span>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="appointmentType"
                  value="APPOINTMENT"
                  defaultChecked
                  className="accent-amber-600"
                />
                <span className="text-sm text-stone-700">Pre-booked appointment</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="appointmentType"
                  value="WALK_IN"
                  className="accent-amber-600"
                />
                <span className="text-sm text-stone-700">Walk-in</span>
              </label>
            </div>
          </div>

          {/* Groomer and station are not chosen here: the customer's groomer
              takes the visit, at that groomer's station. Both can be changed on
              the appointment itself. */}

          {/* Notes */}
          <div>
            <label htmlFor="visitNotes" className="block text-sm font-semibold text-stone-700 mb-1.5">
              Notes <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="visitNotes"
              name="visitNotes"
              rows={3}
              placeholder="Any special instructions for this visit…"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              Create Appointment
            </button>
            <Link
              href="/staff/appointments"
              className="text-sm text-stone-500 hover:text-stone-800 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </PageSection>
    </PageShell>
  );
}
