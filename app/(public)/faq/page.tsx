import { faqJsonLd, publicMetadata, serializeJsonLd } from "@/lib/seo";
import { activeFaq, seoOverride } from "@/lib/seo-pages";
import { geocode } from "@/lib/maps";
import { getConfig } from "@/lib/config";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export async function generateMetadata() {
  const config = await getConfig();
  // The city in the title comes from the same cached lookup the maps use.
  return publicMetadata(config, "/faq", await seoOverride("/faq"), await geocode(config.shopAddress));
}

export default async function FaqPage() {
  const [config, faq] = await Promise.all([getConfig(), activeFaq()]);
  // No questions, no page: the nav link is hidden by the same query.
  if (faq.length === 0) notFound();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const questions = faqJsonLd(config, faq);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {questions && <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(questions) }} />}
      <section className="glass-panel rounded-3xl p-6 md:p-10" aria-labelledby="faq-heading">
        <h1 id="faq-heading" className="public-section-title text-ink">Frequently asked questions</h1>
        <div className="mt-6 divide-y divide-line">
          {faq.map((item) => (
            <details key={item.id} className="disclosure py-4">
              <summary className="cursor-pointer font-semibold text-ink">{item.question}</summary>
              <p className="mt-2 whitespace-pre-line text-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
