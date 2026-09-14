import { prisma } from "@/lib/prisma";
import { shopDayKey } from "@/lib/utils";
import { shopMoment } from "@/lib/shop-time";
import ServicePicker from "@/components/ServicePicker";
import { PageShell, PageSection, Well } from "@/components/ui";
import {
  getServiceOptions,
  resolveSelectedServices,
  sendBookingNotifications,
  setAppointmentServices,
} from "@/lib/appointment-services";
import { bookingRateSnapshot } from "@/lib/pricing-tiers";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { acceptWaiver, waiverOutstanding } from "@/lib/waiver-status";
import Link from "next/link";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Book an appointment" };

export default async function PortalNewAppointmentPage() {
  const session = await auth();
  if (!session || session.user.userType !== "customer") {
    redirect("/login");
  }

  const customerId = session.user.id;

  const [pets, config, serviceOptions] = await Promise.all([
    prisma.pet.findMany({
      where: { customerId, isActive: true },
      orderBy: { name: "asc" },
    }),
    getConfig(),
    getServiceOptions(),
  ]);

  // A waiver version bump has to re-prompt: booking is the moment it matters.
  const waiver = await waiverOutstanding(customerId);
  if (waiver.required) {
    return (
      <PageShell
        title="One thing first"
        subtitle="Our liability waiver has been updated."
        className="max-w-2xl"
      >
        <PageSection>
          <Well className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-stone-700 py-2">
            {waiver.text}
          </Well>
        </PageSection>
        <PageSection tone="muted">
        <form action={acceptCurrentWaiver} className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" name="accepted" required className="accent-amber-700" />I have
            read and agree to the waiver (version {waiver.version}).
          </label>
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold"
          >
            Accept and continue
          </button>
        </form>
        </PageSection>
      </PageShell>
    );
  }

  if (!config.featureOnlineBooking) {
    return (
      <PageShell title="Book an Appointment" className="max-w-lg">
        <PageSection>
          <Well className="py-3 text-center">
            <p className="text-stone-500 text-sm">Online booking is unavailable right now. Call us to book.</p>
            {config.shopPhone && (
              <a href={`tel:${config.shopPhone}`} className="mt-2 inline-block text-brand-text font-semibold hover:underline">
                {config.shopPhone}
              </a>
            )}
          </Well>
        </PageSection>
      </PageShell>
    );
  }

  // Calculate min/max dates from config
  const now = new Date();
  const leadMs = (config.bookingLeadHours ?? 2) * 60 * 60 * 1000;
  const minDate = new Date(now.getTime() + leadMs);
  const maxDate = new Date(
now.getTime() + (config.bookingWindowDays ?? 30) * 24 * 60 * 60 * 1000
  );

  async function acceptCurrentWaiver(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");
    if (formData.get("accepted") !== "on") redirect("/portal/appointments/new");

    const headerList = await headers();
    await acceptWaiver(session.user.id, {
      ipAddress: headerList.get("x-forwarded-for"),
      userAgent: headerList.get("user-agent"),
    });

    revalidatePath("/portal/appointments/new");
    redirect("/portal/appointments/new");
  }

  async function createPortalAppointment(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session || session.user.userType !== "customer") redirect("/login");

    const customerId = session.user.id;
    const petId = formData.get("petId") as string;
    const preferredDate = formData.get("preferredDate") as string;
    const preferredTime = formData.get("preferredTime") as string;
    const visitNotes = (formData.get("visitNotes") as string) || null;

    if (!petId || !preferredDate || !preferredTime) {
      throw new Error("Missing required fields");
    }

    // Customers can book several services on one visit.
    const services = await resolveSelectedServices(
      formData.getAll("serviceIds").map((value) => String(value))
    );
    if (!services) throw new Error("Select at least one service");

    // Verify the pet belongs to this customer
    const pet = await prisma.pet.findFirst({ where: { id: petId, customerId, isActive: true } });
    if (!pet) throw new Error("Pet not found");

    // Shop wall clock, not the server's: in production this runs in UTC, and a
    // nine o'clock booking would otherwise be stored as two in the morning.
    const scheduledAt = shopMoment(preferredDate, preferredTime);
    if (Number.isNaN(scheduledAt.getTime())) throw new Error("Pick a valid date and time");

    // Customers on a negotiated rate are quoted it from the moment they book.
    const rate = await bookingRateSnapshot(customerId, services.lines);

    const appointment = await prisma.appointment.create({
      data: {
        customerId,
        petId,
        scheduledAt,
        serviceType: services.primaryType,
        durationMins: services.totalDurationMins ?? undefined,
        appointmentType: "APPOINTMENT",
        status: "SCHEDULED",
        visitNotes: visitNotes ?? undefined,
        pricingTierId: rate.pricingTierId,
        pricingDiscountCents: rate.pricingDiscountCents,
      },
    });

    await setAppointmentServices(appointment.id, services);
    await sendBookingNotifications(appointment.id);

    await prisma.appointmentStatusHistory.create({
      data: {
        appointmentId: appointment.id,
        status: "SCHEDULED",
        note: "Booked online by customer",
      },
    });

    redirect("/portal/appointments");
  }

  return (
    <PageShell
      title="Book an Appointment"
      subtitle="We'll confirm shortly, by email."
      back={{ href: "/portal/appointments", label: "Back to My Appointments" }}
      className="max-w-lg"
    >
      <PageSection>
      {/* No pets on file */}
      {pets.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-stone-700 font-medium">No pets on file</p>
          <p className="text-stone-500 text-sm mt-1">
            Add your pet&apos;s profile before booking an appointment.
          </p>
          <Link
            href="/portal/pets/new"
            className="mt-3 inline-block bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Add a Pet
          </Link>
        </div>
      ) : (
        <form action={createPortalAppointment} className="space-y-3">
            {/* Pet */}
            <div>
              <label htmlFor="petId" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Which pet? <span className="text-red-700">*</span>
              </label>
              <select
                id="petId"
                name="petId"
                required
                defaultValue=""
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 bg-white"
              >
                <option value="" disabled>Select a pet…</option>
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.breed ? ` (${p.breed})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Services — book as many as the visit needs */}
            <div>
              <span className="block text-sm font-semibold text-stone-700 mb-1.5">
                Services <span className="text-red-700">*</span>
              </span>
              <ServicePicker services={serviceOptions} />
            </div>

            {/* Preferred Date */}
            <div>
              <label htmlFor="preferredDate" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Preferred Date <span className="text-red-700">*</span>
              </label>
              <input
                id="preferredDate"
                name="preferredDate"
                type="date"
                required
                min={shopDayKey(minDate)}
                max={shopDayKey(maxDate)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800"
              />
              <p className="mt-1 text-xs text-stone-400">
                Available up to {config.bookingWindowDays ?? 30} days in advance.
              </p>
            </div>

            {/* Preferred Time */}
            <div>
              <label htmlFor="preferredTime" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Preferred Time <span className="text-red-700">*</span>
              </label>
              <input
                id="preferredTime"
                name="preferredTime"
                type="time"
                required
                min="08:00"
                max="17:00"
                step={1800}
                defaultValue="09:00"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800"
              />
              <p className="mt-1 text-xs text-stone-400">Business hours: 8:00 AM – 5:00 PM</p>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="visitNotes" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Notes <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="visitNotes"
                name="visitNotes"
                rows={3}
                placeholder="Anything we should know for this visit…"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 resize-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                Request Appointment
              </button>
              <Link
                href="/portal/appointments"
                className="text-sm text-stone-500 hover:text-stone-800 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
      )}
      </PageSection>
    </PageShell>
  );
}
