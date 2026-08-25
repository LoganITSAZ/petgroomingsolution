// The kiosk is a client component and cannot export metadata itself, so the
// title lives here (WCAG 2.4.2).
export const metadata = { title: "Station display" };

export default function StationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
