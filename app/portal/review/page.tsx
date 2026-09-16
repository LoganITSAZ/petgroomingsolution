import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { requireFeature } from "@/lib/auth-guards";
import { RATING_MAX, readRating, testimonialState } from "@/lib/testimonials";
import { formatShopDate } from "@/lib/utils";
import Stars from "@/components/Stars";
import { PageShell, PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Write a Review" };

// Reads SystemConfig, so it must never be prerendered.
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  quote_required: "Write a line or two before sending it.",
  no_visits: "Reviews are open once a visit has been finished.",
};

/** How the shop credits somebody by default: first name, last initial. */
function creditAs(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0);
  return initial ? `${firstName} ${initial}.` : firstName;
}

interface PageProps {
  searchParams: Promise<{ sent?: string; error?: string }>;
}

export default async function PortalReviewPage(props: PageProps) {
  const session = await auth();
  if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");
  const customerId = session.user.id;

  const config = await getConfig();
  // The page redirects itself: hiding the header link is presentation.
  if (!isEnabled(config, "featureTestimonials")) redirect("/portal");

  const searchParams = await props.searchParams;
  const [customer, finishedVisits, mine] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { firstName: true, lastName: true, pets: { select: { id: true, name: true } } },
    }),
    // Nothing to review until something has happened. It also keeps the form
    // off a brand-new account, which is the only free one to make.
    prisma.appointment.count({
      where: {
        customerId,
        status: { in: ["COMPLETE", "READY_PICKUP", "PICKED_UP"] },
      },
    }),
    prisma.testimonial.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!customer) redirect("/login?type=customer");

  async function submitReview(formData: FormData) {
    "use server";

    // A server action is its own endpoint: the session check above did not run
    // for this request, and neither did the feature check.
    const session = await auth();
    if (!session?.user || session.user.userType !== "customer") redirect("/login?type=customer");
    await requireFeature("featureTestimonials");
    const customerId = session.user.id;

    const quote = ((formData.get("quote") as string | null) ?? "").trim();
    if (!quote) redirect("/portal/review?error=quote_required");

    // Re-checked here rather than trusted from the render: the form was drawn
    // a while ago and this is the only place it is enforced.
    const finished = await prisma.appointment.count({
      where: { customerId, status: { in: ["COMPLETE", "READY_PICKUP", "PICKED_UP"] } },
    });
    if (finished === 0) redirect("/portal/review?error=no_visits");

    const me = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { firstName: true, lastName: true },
    });
    if (!me) redirect("/login?type=customer");

    const petId = ((formData.get("petId") as string | null) ?? "").trim();
    // The name is read from the customer's own pets, never from the posted
    // value: the field is a select, and a select is not a promise.
    const pet = petId
      ? await prisma.pet.findFirst({ where: { id: petId, customerId }, select: { name: true } })
      : null;

    await prisma.testimonial.create({
      data: {
        quote,
        // The customer does not get to type the byline. It is derived, so a
        // review cannot be signed as somebody else.
        author: creditAs(me.firstName, me.lastName),
        petName: pet?.name ?? null,
        rating: readRating(formData.get("rating")),
        customerId,
        // approvedAt stays null: a manager reads it first.
      },
    });

    redirect("/portal/review?sent=1");
  }

  const canWrite = finishedVisits > 0;

  return (
    <PageShell
      title="Write a Review"
      subtitle="The shop reads every one before it goes on the site. Nothing is published as you send it."
      back={{ href: "/portal", label: "Back to dashboard" }}
    >
      {searchParams.sent === "1" && (
        <SaveToast>Sent — thank you. The shop will read it before it goes up.</SaveToast>
      )}
      {searchParams.error && <SaveToast tone="error">{NOTICES[searchParams.error]}</SaveToast>}

      {!canWrite ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          Reviews open after your first finished visit.{" "}
          <Link href="/portal/appointments" className="text-brand-text underline">
            Your appointments
          </Link>
        </PageSection>
      ) : (
        <PageSection>
          <form action={submitReview} className="space-y-4 max-w-2xl">
            <label className="text-sm block">
              <span className="block font-medium text-stone-700 mb-1">How did it go?</span>
              <textarea
                name="quote"
                rows={4}
                required
                maxLength={600}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm resize-y focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none"
              />
            </label>

            {/* Radios, not a widget: five of them are keyboard-reachable,
                announce themselves, and need no JavaScript. The stars are
                decoration over the number. */}
            <fieldset>
              <legend className="text-sm font-medium text-stone-700 mb-1">
                Rating <span className="font-normal text-stone-400">(optional)</span>
              </legend>
              <div className="flex flex-wrap gap-3">
                {Array.from({ length: RATING_MAX }, (_, i) => RATING_MAX - i).map((n) => (
                  <label key={n} className="flex items-center gap-1.5 text-sm text-stone-700">
                    <input type="radio" name="rating" value={n} className="accent-amber-700" />
                    <Stars rating={n} />
                  </label>
                ))}
              </div>
            </fieldset>

            {customer.pets.length > 0 && (
              <label className="text-sm block max-w-xs">
                <span className="block font-medium text-stone-700 mb-1">
                  Which pet? <span className="font-normal text-stone-400">(optional)</span>
                </span>
                <select
                  name="petId"
                  defaultValue=""
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Don&rsquo;t mention a pet</option>
                  {customer.pets.map((pet) => (
                    <option key={pet.id} value={pet.id}>
                      {pet.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <p className="text-xs text-stone-400">
              It would appear as <strong>{creditAs(customer.firstName, customer.lastName)}</strong>{" "}
              — first name and last initial, never your full name or contact details.
            </p>

            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-bold transition-colors"
            >
              Send to the shop
            </button>
          </form>
        </PageSection>
      )}

      {mine.length > 0 && (
        <PageSection title="What you have sent" padded={false} bodyClassName="divide-y divide-stone-100">
          {mine.map((testimonial) => {
            const state = testimonialState(testimonial);
            return (
              <div key={testimonial.id} className="px-4 py-3">
                <p className="text-sm text-stone-700">&ldquo;{testimonial.quote}&rdquo;</p>
                <p className="mt-1 text-xs text-stone-400">
                  {formatShopDate(testimonial.createdAt)}
                  {testimonial.rating !== null && (
                    <>
                      {" · "}
                      <Stars rating={testimonial.rating} />
                    </>
                  )}
                  {" · "}
                  {state === "queued"
                    ? "with the shop"
                    : state === "published"
                      ? "on the site"
                      : "not currently shown"}
                </p>
              </div>
            );
          })}
        </PageSection>
      )}
    </PageShell>
  );
}
