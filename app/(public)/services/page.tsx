import type { Metadata } from "next";

export const metadata: Metadata = { title: "Services & Pricing" };

const DOG_SERVICES = [
  { service: "Bath + Tidy", small: "$45", medium: "$60", large: "$85", xl: "$120" },
  { service: "Bath + Trim", small: "$55", medium: "$75", large: "$100", xl: "$145" },
  { service: "Full Groom", small: "$75", medium: "$100", large: "$140", xl: "$190" },
  { service: "Nail Trim", small: "$17", medium: "$20", large: "$25", xl: "$30" },
  { service: "Nail Grind", small: "$20", medium: "$25", large: "$30", xl: "$35" },
  { service: "Teeth Brushing", small: "$15", medium: "$15", large: "$15", xl: "$15" },
  { service: "Ear Cleaning", small: "$15", medium: "$15", large: "$15", xl: "$15" },
];

const CAT_SERVICES = [
  { service: "Bath / Comb / Nails", price: "$55–$70" },
  { service: "Haircut", price: "$95–$130" },
  { service: "Lion Cut", price: "$85–$110" },
];

const WALKIN_SERVICES = [
  { service: "Nail Trim", note: "Walk-in, 9am–3pm" },
  { service: "Teeth Brushing", note: "Walk-in, 9am–3pm" },
  { service: "Gland Expression", note: "Walk-in, 9am–3pm" },
];

const SURCHARGES = [
  { condition: "Matted coat", fee: "$15–$55" },
  { condition: "Difficult / aggressive handling", fee: "$15–$55" },
  { condition: "Late pickup (after close)", fee: "$25" },
];

export default function ServicesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-black text-stone-900 mb-2">Services & Pricing</h1>
      <p className="text-stone-500 mb-12">Pricing varies by pet size. Appointments required for most services.</p>

      {/* Dogs */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-stone-800 mb-4">🐶 Dogs</h2>
        <p className="text-stone-500 text-sm mb-4">Pricing by weight: Small &lt;15 lbs · Medium 15–30 lbs · Large 30–45 lbs · XL 50 lbs+</p>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full text-left">
            <thead className="bg-stone-100 text-stone-600 text-sm uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Small</th>
                <th className="px-4 py-3">Medium</th>
                <th className="px-4 py-3">Large</th>
                <th className="px-4 py-3">XL</th>
              </tr>
            </thead>
            <tbody>
              {DOG_SERVICES.map((row, i) => (
                <tr key={row.service} className={i % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                  <td className="px-4 py-3 font-medium text-stone-900">{row.service}</td>
                  <td className="px-4 py-3 text-stone-600">{row.small}</td>
                  <td className="px-4 py-3 text-stone-600">{row.medium}</td>
                  <td className="px-4 py-3 text-stone-600">{row.large}</td>
                  <td className="px-4 py-3 text-stone-600">{row.xl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Cats */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-stone-800 mb-4">🐱 Cats</h2>
        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full text-left">
            <thead className="bg-stone-100 text-stone-600 text-sm uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Price</th>
              </tr>
            </thead>
            <tbody>
              {CAT_SERVICES.map((row, i) => (
                <tr key={row.service} className={i % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                  <td className="px-4 py-3 font-medium text-stone-900">{row.service}</td>
                  <td className="px-4 py-3 text-stone-600">{row.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Walk-in */}
      <section className="mb-14">
        <h2 className="text-2xl font-bold text-stone-800 mb-4">Walk-in Services</h2>
        <p className="text-stone-500 text-sm mb-4">No appointment needed. Available 9am–3pm daily.</p>
        <ul className="space-y-2">
          {WALKIN_SERVICES.map((s) => (
            <li key={s.service} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <span className="font-medium text-stone-900">{s.service}</span>
              <span className="text-stone-500 text-sm">{s.note}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Surcharges */}
      <section>
        <h2 className="text-2xl font-bold text-stone-800 mb-4">Additional Fees</h2>
        <ul className="space-y-2">
          {SURCHARGES.map((s) => (
            <li key={s.condition} className="flex justify-between bg-stone-100 rounded-lg px-4 py-3">
              <span className="text-stone-700">{s.condition}</span>
              <span className="font-semibold text-stone-900">{s.fee}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
