import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatServiceType } from "@/lib/utils";

const SERVICE_TYPES = [
  "BATH_AND_TIDY",
  "BATH_AND_TRIM",
  "FULL_GROOM",
  "LION_CUT",
  "NAIL_TRIM",
  "NAIL_GRIND",
  "EAR_CLEANING",
  "TEETH_BRUSHING",
  "GLAND_EXPRESSION",
  "ADD_ON",
  "CUSTOM",
] as const;

export default async function PortalNewAppointmentPage() {
  const session = await auth();
  if (!session || session.user.userType !== "customer") {
    redirect("/login");
  }

  const customerId = session.user.id;

  const [pets, config] = await Promise.all([
    prisma.pet.findMany({
      where: { customerId, isActive: true },
      orderBy: { name: "asc" },
    }),
    getConfig(),
  ]);

  if (!config.featureOnlineBooking) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <p className="text-stone-500">Online booking is currently unavailable. Please call us to book.</p>
        {config.shopPhone && (
          <a href={`tel:${config.shopPhone}`} className="mt-3 inline-block text-amber-700 font-semibold hover:text-amber-900">
            {config.shopPhone}
          </a>
        )}
      </div>
    );
  }

  // Calculate min/max dates from config
  const leadMs = (config.bookingLeadHours ?? 2) * 60 * 60 * 1000;
  const minDate = new Date(Date.now() + leadMs);
  const maxDate = new Date(Date.now() + (config.bookingWindowDays ?? 30) * 24 * 60 * 60 * 1000);

  const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

  async function createPortalAppointment(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session || session.user.userType !== "customer") redirect("/login");

    const customerId = session.user.id;
    const petId = formData.get("petId") as string;
    const serviceType = formData.get("serviceType") as string;
    const preferredDate = formData.get("preferredDate") as string;
    const preferredTime = formData.get("preferredTime") as string;
    const visitNotes = (formData.get("visitNotes") as string) || null;

    if (!petId || !serviceType || !preferredDate || !preferredTime) {
      throw new Error("Missing required fields");
    }

    // Verify the pet belongs to this customer
    const pet = await prisma.pet.findFirst({ where: { id: petId, customerId, isActive: true } });
    if (!pet) throw new Error("Pet not found");

    const scheduledAt = new Date(`${preferredDate}T${preferredTime}:00`);

    const appointment = await prisma.appointment.create({
      data: {
        customerId,
        petId,
        scheduledAt,
        serviceType: serviceType as never,
        appointmentType: "APPOINTMENT",
        status: "SCHEDULED",
        visitNotes: visitNotes ?? undefined,
      },
    });

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
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-stone-900">Book an Appointment</h1>
        <p className="text-stone-500 text-sm mt-1">
          We&apos;ll confirm your booking shortly. You&apos;ll receive a confirmation email once it&apos;s approved.
        </p>
      </div>

      {/* No pets on file */}
      {pets.length === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
          <p className="text-stone-700 font-medium">No pets on file</p>
          <p className="text-stone-500 text-sm mt-1">
            Add your pet&apos;s profile before booking an appointment.
          </p>
          <Link
            href="/portal/pets/new"
            className="mt-4 inline-block bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Add a Pet
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl p-6">
          <form action={createPortalAppointment} className="space-y-5">
            {/* Pet */}
            <div>
              <label htmlFor="petId" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Which pet? <span className="text-red-500">*</span>
              </label>
              <select
                id="petId"
                name="petId"
                required
                defaultValue=""
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              >
                <option value="" disabled>Select a pet…</option>
                {pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.breed ? ` (${p.breed})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Service Type */}
            <div>
              <label htmlFor="serviceType" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Service <span className="text-red-500">*</span>
              </label>
              <select
                id="serviceType"
                name="serviceType"
                required
                defaultValue=""
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              >
                <option value="" disabled>Select a service…</option>
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {formatServiceType(s)}
                  </option>
                ))}
              </select>
            </div>

            {/* Preferred Date */}
            <div>
              <label htmlFor="preferredDate" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Preferred Date <span className="text-red-500">*</span>
              </label>
              <input
                id="preferredDate"
                name="preferredDate"
                type="date"
                required
                min={toDateInput(minDate)}
                max={toDateInput(maxDate)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="mt-1 text-xs text-stone-400">
                Available up to {config.bookingWindowDays ?? 30} days in advance.
              </p>
            </div>

            {/* Preferred Time */}
            <div>
              <label htmlFor="preferredTime" className="block text-sm font-semibold text-stone-700 mb-1.5">
                Preferred Time <span className="text-red-500">*</span>
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
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
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
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
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
        </div>
      )}
    </div>
  );
}
