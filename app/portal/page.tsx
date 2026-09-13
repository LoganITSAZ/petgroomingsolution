import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatStatus, formatServiceType } from "@/lib/utils";
import { rewardCard } from "@/lib/rewards";
import RewardCard from "@/components/RewardCard";
import { PageShell, PageSection, Well } from "@/components/ui";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "My account" };

export default async function PortalDashboard() {
  const session = await auth();
  const customerId = session!.user.id;

  const [customer, upcomingAppointments, pets, card] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      include: { waiverAcceptances: true },
    }),
    prisma.appointment.findMany({
      where: {
        customerId,
        status: { notIn: ["PICKED_UP", "CANCELLED", "NO_SHOW"] },
      },
      include: { pet: true, station: true },
      orderBy: { scheduledAt: "asc" },
      take: 5,
    }),
    prisma.pet.findMany({
      where: { customerId, isActive: true },
      orderBy: { name: "asc" },
    }),
    rewardCard(customerId),
  ]);

  return (
    <PageShell
      title={`Welcome back, ${customer?.firstName}`}
      subtitle="Your pets and your visits."
    >
      {/* The punch card. Every finished visit is a punch. */}
      {card.enabled && (
        <PageSection title="Your rewards" tone={card.available > 0 ? "plain" : "muted"}>
          <RewardCard card={card} />
          <p className="text-xs text-stone-500 mt-2">
            {card.available > 0
              ? "Mention it at the counter on your next visit and we will take care of it."
              : `Every ${card.perReward} visits earns ${card.label.toLowerCase()}.`}
          </p>
        </PageSection>
      )}

      <PageSection
        title="Upcoming appointments"
        hint={
          <Link href="/portal/appointments/new" className="text-brand-text hover:underline font-medium">
            Book a visit
          </Link>
        }
      >
        {upcomingAppointments.length === 0 ? (
          <Well className="py-2 text-sm text-stone-500">
            Nothing booked.{" "}
            <Link href="/portal/appointments/new" className="text-brand-text hover:underline">
              Book a visit
            </Link>
          </Well>
        ) : (
          <Well as="ul" className="px-0 py-0 divide-y divide-well-line">
            {upcomingAppointments.map((appt) => (
              <li key={appt.id} className="px-3 py-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-stone-900">{appt.pet.name}</p>
                  <p className="text-sm text-stone-500">
                    {formatServiceType(appt.serviceType)} ·{" "}
                    {new Date(appt.scheduledAt).toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium bg-stone-100 text-stone-600 px-3 py-1 rounded-full">
                  {formatStatus(appt.status)}
                </span>
              </li>
            ))}
          </Well>
        )}
      </PageSection>

      <PageSection
        title="My pets"
        hint={
          <Link href="/portal/pets/new" className="text-brand-text hover:underline font-medium">
            Add a pet
          </Link>
        }
      >
        {pets.length === 0 ? (
          <Well className="py-2 text-sm text-stone-500">
            No pets on file.{" "}
            <Link href="/portal/pets/new" className="text-brand-text hover:underline">
              Add your first
            </Link>
          </Well>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {pets.map((pet) => (
              <Link
                key={pet.id}
                href={`/portal/pets/${pet.id}`}
                className="rounded-lg border border-well-line bg-well ring-1 ring-well-line/60 px-3 py-2 flex items-center gap-3 hover:bg-white transition-colors"
              >
                <span className="text-3xl" aria-hidden="true">{pet.species === "CAT" ? "🐱" : "🐶"}</span>
                <div>
                  <p className="font-semibold text-stone-900">{pet.name}</p>
                  <p className="text-sm text-stone-500">{pet.breed ?? pet.species}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}
