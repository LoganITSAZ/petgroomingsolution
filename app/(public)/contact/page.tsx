import type { Metadata } from "next";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const config = await getConfig();

  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-black text-stone-900 mb-8">Contact Us</h1>
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          {config.shopPhone && (
            <div>
              <p className="text-sm uppercase tracking-widest text-stone-400 mb-1">Phone</p>
              <a href={`tel:${config.shopPhone}`} className="text-xl font-semibold text-brand-700 hover:underline">
                {config.shopPhone}
              </a>
            </div>
          )}
          {config.shopAddress && (
            <div>
              <p className="text-sm uppercase tracking-widest text-stone-400 mb-1">Address</p>
              <p className="text-lg text-stone-700">{config.shopAddress}</p>
            </div>
          )}
          <div>
            <p className="text-sm uppercase tracking-widest text-stone-400 mb-2">Hours</p>
            <div className="space-y-1 text-stone-700">
              <p><span className="font-medium">Monday</span> · 8:00 am – 3:00 pm</p>
              <p><span className="font-medium">Tuesday – Saturday</span> · 8:00 am – 5:00 pm</p>
              <p><span className="font-medium">Sunday</span> · Closed</p>
            </div>
          </div>
        </div>
        <div className="bg-stone-100 rounded-2xl p-6 flex items-center justify-center text-center">
          <div>
            <p className="text-4xl mb-3">📍</p>
            <p className="text-stone-600">8911 N Central Ave #104</p>
            <p className="text-stone-600">Phoenix, AZ 85020</p>
            <a
              href="https://maps.google.com/?q=8911+N+Central+Ave+104+Phoenix+AZ+85020"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 text-brand-600 hover:underline font-medium"
            >
              Open in Google Maps →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
