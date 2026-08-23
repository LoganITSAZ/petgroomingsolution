import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function AdminOverview() {
  const [config, staffCount, stationCount, customerCount] = await Promise.all([
    getConfig(),
    prisma.staff.count({ where: { isActive: true } }),
    prisma.station.count({ where: { isActive: true } }),
    prisma.customer.count({ where: { isActive: true } }),
  ]);

  const features = [
    { label: "Online Booking", enabled: config.featureOnlineBooking, href: "/admin/features" },
    { label: "Walk-in Portal", enabled: config.featureWalkInPortal, href: "/admin/features" },
    { label: "Email Notifications", enabled: config.featureEmailNotify, href: "/admin/notifications" },
    { label: "SMS Notifications", enabled: config.featureSmsNotify, href: "/admin/notifications" },
    { label: "Liability Waiver", enabled: config.featureWaiverRequired, href: "/admin/waiver" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-stone-900">Admin Overview</h1>
        <p className="text-stone-500 text-sm mt-1">{config.shopName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active Staff", value: staffCount, href: "/admin/staff" },
          { label: "Stations", value: stationCount, href: "/admin/stations" },
          { label: "Customers", value: customerCount, href: "/staff/directory" },
        ].map(({ label, value, href }) => (
          <Link key={label} href={href} className="bg-white border border-stone-200 rounded-xl p-5 hover:border-brand-300 transition-colors">
            <p className="text-3xl font-black text-stone-900">{value}</p>
            <p className="text-sm text-stone-500 mt-1">{label}</p>
          </Link>
        ))}
      </div>

      {/* Feature flags */}
      <section>
        <h2 className="font-bold text-stone-800 mb-3">Feature Flags</h2>
        <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-100">
          {features.map(({ label, enabled, href }) => (
            <Link key={label} href={href} className="flex items-center justify-between px-5 py-4 hover:bg-stone-50 transition-colors">
              <span className="text-stone-700 font-medium">{label}</span>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${enabled ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-400"}`}>
                {enabled ? "ON" : "OFF"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
