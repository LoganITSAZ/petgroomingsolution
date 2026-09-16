import { redirect } from "next/navigation";
import type { Testimonial } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config";
import { isEnabled } from "@/lib/features";
import { currentStaffCanManage } from "@/lib/staff-roles";
import { averageRating, RATING_MAX, testimonialState } from "@/lib/testimonials";
import { formatShopDate } from "@/lib/utils";
import Stars from "@/components/Stars";
import { PageShell, PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";
import ModalButton from "@/components/ModalButton";
import {
  approveTestimonial,
  deleteTestimonial,
  saveTestimonial,
  unapproveTestimonial,
} from "./actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Testimonials" };

const NOTICES: Record<string, string> = {
  quote_required: "A testimonial needs the customer's own words.",
  author_required: "A testimonial needs a name to credit.",
};

const STATE_BADGE: Record<string, string> = {
  queued: "bg-sky-100 text-sky-700",
  published: "bg-green-100 text-green-700",
  hidden: "bg-stone-100 text-stone-400",
};

const inputClass =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none";

function TestimonialFields({ testimonial }: { testimonial?: Testimonial }) {
  return (
    <div className="space-y-3">
      <label className="text-sm block">
        <span className="block font-medium text-stone-700 mb-1">What they said</span>
        <textarea
          name="quote"
          rows={3}
          required
          defaultValue={testimonial?.quote ?? ""}
          className={`${inputClass} resize-y`}
        />
        <span className="block text-xs text-stone-400 mt-1">
          Their words. The quote marks are added by the page.
        </span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Credited to</span>
          <input
            name="author"
            required
            placeholder="Maria R."
            defaultValue={testimonial?.author ?? ""}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Pet (optional)</span>
          <input name="petName" defaultValue={testimonial?.petName ?? ""} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Rating</span>
          <select name="rating" defaultValue={testimonial?.rating ?? ""} className={inputClass}>
            <option value="">No rating</option>
            {Array.from({ length: RATING_MAX }, (_, i) => RATING_MAX - i).map((n) => (
              <option key={n} value={n}>
                {"★".repeat(n)} ({n})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Sort order</span>
          <input
            name="sortOrder"
            inputMode="numeric"
            defaultValue={testimonial?.sortOrder ?? 0}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={testimonial?.isActive ?? true}
          className="accent-amber-700"
        />
        Show on the home page
      </label>
    </div>
  );
}

/** The one-line identity of a testimonial, shared by both lists. */
function Summary({ testimonial }: { testimonial: Testimonial & { customer: { firstName: string; lastName: string } | null } }) {
  return (
    <span className="min-w-0">
      <span className="font-semibold text-stone-900">{testimonial.author}</span>
      {testimonial.petName && (
        <span className="ml-2 text-xs text-stone-500">{testimonial.petName}</span>
      )}
      {testimonial.rating !== null && <Stars rating={testimonial.rating} className="ml-2 text-xs" />}
      <span className="block truncate text-xs text-stone-400">{testimonial.quote}</span>
      <span className="block text-xs text-stone-400">
        {testimonial.customer
          ? `Written in the portal by ${testimonial.customer.firstName} ${testimonial.customer.lastName}`
          : "Typed in by the shop"}
        {" · "}
        {formatShopDate(testimonial.createdAt)}
      </span>
    </span>
  );
}

interface PageProps {
  searchParams: Promise<{
    saved?: string;
    deleted?: string;
    approved?: string;
    queued?: string;
    error?: string;
  }>;
}

export default async function AdminTestimonialsPage(props: PageProps) {
  // Managers run the shop; this is shop copy, not a technical screen.
  if (!(await currentStaffCanManage())) redirect("/staff");

  const config = await getConfig();
  // The page redirects itself: hiding the sidebar link is presentation.
  if (!isEnabled(config, "featureTestimonials")) redirect("/admin/settings");

  const searchParams = await props.searchParams;
  const testimonials = await prisma.testimonial.findMany({
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  const queued = testimonials.filter((t) => testimonialState(t) === "queued");
  const reviewed = testimonials.filter((t) => testimonialState(t) !== "queued");
  const published = reviewed.filter((t) => t.isActive);
  const average = averageRating(published);
  const errorMessage = searchParams.error ? NOTICES[searchParams.error] : undefined;

  return (
    <PageShell
      title="Testimonials"
      subtitle={
        <>
          {published.length} on the home page
          {average !== null && ` · ${average} out of ${RATING_MAX} average`}
          {queued.length > 0 && ` · ${queued.length} waiting to be read`}
        </>
      }
      actions={
        <ModalButton
          label="New testimonial"
          title="New testimonial"
          description="A customer's own words, credited the way they asked to be credited. Anything the shop types in here is published as it is saved."
        >
          <form action={saveTestimonial} className="space-y-4">
            <TestimonialFields />
            <div className="flex justify-end">
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-bold transition-colors"
              >
                Publish
              </button>
            </div>
          </form>
        </ModalButton>
      }
    >
      {searchParams.saved && <SaveToast>Saved {searchParams.saved}.</SaveToast>}
      {searchParams.approved === "1" && <SaveToast>Published on the home page.</SaveToast>}
      {searchParams.queued === "1" && (
        <SaveToast>Taken off the site and back in the queue.</SaveToast>
      )}
      {searchParams.deleted === "1" && <SaveToast>Testimonial removed.</SaveToast>}
      {errorMessage && <SaveToast tone="error">{errorMessage}</SaveToast>}

      {/* The queue first: it is the only band with something owed on it. It is
          hidden when empty rather than shown as a reassuring nil — an empty
          band above the list is a thing to scan past every visit. */}
      {queued.length > 0 && (
        <PageSection
          title="Waiting to be read"
          hint="Nothing here is on the site yet. Edit the wording if it needs it, then publish."
          padded={false}
          bodyClassName="divide-y divide-stone-100"
        >
          {queued.map((testimonial) => (
            <details key={testimonial.id} open={queued.length === 1}>
              <summary className="px-4 py-2.5 cursor-pointer flex items-center justify-between gap-3">
                <Summary testimonial={testimonial} />
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-sky-100 text-sky-700">
                  new
                </span>
              </summary>
              <div className="px-5 pb-5 border-t border-stone-100 pt-4 space-y-4">
                <form action={saveTestimonial} className="space-y-3">
                  <input type="hidden" name="id" value={testimonial.id} />
                  <TestimonialFields testimonial={testimonial} />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="border border-stone-200 hover:bg-stone-50 px-5 py-2 rounded-lg text-sm font-semibold text-stone-700"
                    >
                      Save wording
                    </button>
                  </div>
                </form>
                <div className="flex justify-between gap-3 border-t border-stone-100 pt-4">
                  <form action={deleteTestimonial}>
                    <input type="hidden" name="id" value={testimonial.id} />
                    <button
                      type="submit"
                      className="text-xs text-stone-400 hover:text-red-600 underline"
                    >
                      Discard this one
                    </button>
                  </form>
                  <form action={approveTestimonial}>
                    <input type="hidden" name="id" value={testimonial.id} />
                    <button
                      type="submit"
                      className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      Publish
                    </button>
                  </form>
                </div>
              </div>
            </details>
          ))}
        </PageSection>
      )}

      {reviewed.length === 0 ? (
        <PageSection grow className="text-center text-stone-400 text-sm">
          Nothing published yet. Until there is, the home page lists the services instead.
        </PageSection>
      ) : (
        <PageSection
          title="Published"
          grow
          scroll
          padded={false}
          bodyClassName="divide-y divide-stone-100"
        >
          {reviewed.map((testimonial) => {
            const state = testimonialState(testimonial);
            return (
              <details key={testimonial.id}>
                <summary className="px-4 py-2.5 cursor-pointer flex items-center justify-between gap-3">
                  <Summary testimonial={testimonial} />
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${STATE_BADGE[state]}`}
                  >
                    {state}
                  </span>
                </summary>
                <div className="px-5 pb-5 border-t border-stone-100 pt-4 space-y-4">
                  <form action={saveTestimonial} className="space-y-3">
                    <input type="hidden" name="id" value={testimonial.id} />
                    <TestimonialFields testimonial={testimonial} />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                  <div className="flex justify-between gap-3 border-t border-stone-100 pt-4">
                    <form action={deleteTestimonial}>
                      <input type="hidden" name="id" value={testimonial.id} />
                      <button
                        type="submit"
                        className="text-xs text-stone-400 hover:text-red-600 underline"
                      >
                        Delete this testimonial
                      </button>
                    </form>
                    <form action={unapproveTestimonial}>
                      <input type="hidden" name="id" value={testimonial.id} />
                      <button
                        type="submit"
                        className="text-xs text-stone-400 hover:text-stone-700 underline"
                      >
                        Back to the queue
                      </button>
                    </form>
                  </div>
                </div>
              </details>
            );
          })}
        </PageSection>
      )}
    </PageShell>
  );
}
