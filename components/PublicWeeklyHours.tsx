import { weeklyAvailability, type AvailabilityConfig } from "@/lib/shop-availability";

export default function PublicWeeklyHours({ config }: { config: AvailabilityConfig }) {
  return (
    <div className="public-weekly-hours">
      <table>
        <caption className="sr-only">Weekly shop opening and walk-in hours in shop local time</caption>
        <thead><tr><th scope="col">Days</th><th scope="col">Shop hours</th><th scope="col">Walk-ins</th></tr></thead>
        <tbody>
          {weeklyAvailability(config).map(row => (
            <tr key={row.days}><th scope="row">{row.days}</th><td>{row.hours}</td><td className={row.walkIns === "Unavailable" ? "text-muted" : "text-brand-text"}>{row.walkIns}</td></tr>
          ))}
        </tbody>
      </table>
      {!config.featureWalkInPortal && <p className="public-shop-status-detail">Walk-ins are currently disabled.</p>}
    </div>
  );
}
