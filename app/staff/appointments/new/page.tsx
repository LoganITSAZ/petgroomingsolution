import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
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

interface PageProps {
  searchParams: { customerId?: string; petId?: string };
}

export default async function NewStaffAppointmentPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session || session.user.userType !== "staff") {
    redirect("/login");
  }

  const { customerId, petId } = searchParams;

  const [customers, pets, stations, staffList] = await Promise.all([
    prisma.customer.findMany({
      where: { isActive: true },
      orderBy: { lastName: "asc" },
    }),
    prisma.pet.findMany({
      where: {
        isActive: true,
        ...(customerId ? { customerId } : {}),
      },
      orderBy: { name: "asc" },
      include: { customer: { select: { firstName: true, lastName: true } } },
    }),
    prisma.station.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.staff.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Default datetime: next full hour, at least 1 hour from now
  const defaultDt = new Date(Date.now() + 60 * 60 * 1000);
  defaultDt.setMinutes(0, 0, 0);
  const defaultDtLocal = new Date(defaultDt.getTime() - defaultDt.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  async function createAppointment(formData: FormData) {
    "use server";

    const session = await auth();
    if (!session || session.user.userType !== "staff") redirect("/login");

    const customerId = formData.get("customerId") as string;
    const petId = formData.get("petId") as string;
    const scheduledAt = formData.get("scheduledAt") as string;
    const serviceType = formData.get("serviceType") as string;
    const appointmentType = formData.get("appointmentType") as string;
    const stationId = (formData.get("stationId") as string) || null;
    const staffId = (formData.get("staffId") as string) || null;
    const durationMinsRaw = formData.get("durationMins") as string;
    const visitNotes = (formData.get("visitNotes") as string) || null;

    if (!customerId || !petId || !scheduledAt || !serviceType || !appointmentType) {
      throw new Error("Missing required fields");
    }

    const durationMins = durationMinsRaw ? parseInt(durationMinsRaw, 10) : null;

    const appointment = await prisma.appointment.create({
      data: {
        customerId,
        petId,
        scheduledAt: new Date(scheduledAt),
        serviceType: serviceType as never,
        appointmentType: appointmentType as never,
        status: "SCHEDULED",
        stationId: stationId || undefined,
        staffId: staffId || undefined,
        durationMins: durationMins ?? undefined,
        visitNotes: visitNotes ?? undefined,
      },
    });

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
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/staff/appointments"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 transition-colors"
      >
        ← Back to Appointments
      </Link>

      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <h1 className="text-xl font-black text-stone-900 mb-6">New Appointment</h1>

        <form action={createAppointment} className="space-y-5">
          {/* Customer */}
          <div>
            <label htmlFor="customerId" className="block text-sm font-semibold text-stone-700 mb-1.5">
              Customer <span className="text-red-500">*</span>
            </label>
            <select
              id="customerId"
              name="customerId"
              required
              defaultValue={customerId ?? ""}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            >
              <option value="" disabled>Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.lastName}, {c.firstName} — {c.email}
                </option>
              ))}
            </select>
          </div>

          {/* Pet */}
          <div>
            <label htmlFor="petId" className="block text-sm font-semibold text-stone-700 mb-1.5">
              Pet <span className="text-red-500">*</span>
            </label>
            <select
              id="petId"
              name="petId"
              required
              defaultValue={petId ?? ""}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            >
              <option value="" disabled>Select a pet…</option>
              {pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.customer.firstName} {p.customer.lastName})
                </option>
              ))}
            </select>
            {customerId && pets.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-700">
                No active pets found for this customer.{" "}
                <Link href={`/staff/pets/new?customerId=${customerId}`} className="underline">
                  Add one
                </Link>
              </p>
            )}
          </div>

          {/* Date & Time */}
          <div>
            <label htmlFor="scheduledAt" className="block text-sm font-semibold text-stone-700 mb-1.5">
              Date &amp; Time <span className="text-red-500">*</span>
            </label>
            <input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              required
              defaultValue={defaultDtLocal}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Service Type */}
          <div>
            <label htmlFor="serviceType" className="block text-sm font-semibold text-stone-700 mb-1.5">
              Service Type <span className="text-red-500">*</span>
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

          {/* Appointment Type */}
          <div>
            <span className="block text-sm font-semibold text-stone-700 mb-2">
              Appointment Type <span className="text-red-500">*</span>
            </span>
            <div className="flex gap-6">
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

          {/* Station */}
          <div>
            <label htmlFor="stationId" className="block text-sm font-semibold text-stone-700 mb-1.5">
              Station <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <select
              id="stationId"
              name="stationId"
              defaultValue=""
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            >
              <option value="">Assign at check-in</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Staff */}
          <div>
            <label htmlFor="staffId" className="block text-sm font-semibold text-stone-700 mb-1.5">
              Groomer <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <select
              id="staffId"
              name="staffId"
              defaultValue=""
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            >
              <option value="">Unassigned</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div>
            <label htmlFor="durationMins" className="block text-sm font-semibold text-stone-700 mb-1.5">
              Estimated Duration (minutes){" "}
              <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              id="durationMins"
              name="durationMins"
              type="number"
              min={5}
              max={480}
              step={5}
              placeholder="e.g. 90"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
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
              placeholder="Any special instructions for this visit…"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
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
      </div>
    </div>
  );
}
