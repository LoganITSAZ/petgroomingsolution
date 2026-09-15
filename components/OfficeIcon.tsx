/** Small, consistent line icons for workspace navigation. */
const paths: Record<string, string> = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  appointments: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M8 14h3 M8 18h6",
  customers: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-3.87",
  stations: "M4 3h16v13H4z M8 21h8 M12 16v5",
  schedule: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  services: "M4 7h16 M4 12h16 M4 17h16 M8 4v6 M16 9v6 M10 14v6",
  resources: "M12 5v16 M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1",
  analytics: "M4 3v18h17 M8 16v-4 M13 16V8 M18 16V5",
  reports: "M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h6",
  settings: "M4 7h16 M4 12h16 M4 17h16 M8 4v6 M16 9v6 M10 14v6",
  appearance: "m12 3 9 9-9 9-9-9z M3 12h18 M12 3v18",
  loyalty: "m12 3 3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L3 10l6-1z",
  marketing: "M3 10v4h4l12 5V5L7 10z M7 14l2 7h3",
  notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  system: "M3 12h4l3-8 4 16 3-8h4",
  paw: "M8 14c-3 3-2 7 1 7 2 0 2-1 3-1s1 1 3 1c3 0 4-4 1-7-3-4-5-4-8 0 M7 4a2 3 0 1 0 0 6 2 3 0 0 0 0-6 M17 4a2 3 0 1 0 0 6 2 3 0 0 0 0-6 M2 10v3 M22 10v3",
};

export default function OfficeIcon({ name }: { name: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name] ?? paths.dashboard} /></svg>;
}

export function navigationIcon(href: string) {
  const route = href.split("/").pop() ?? "";
  if (href === "/staff") return "dashboard";
  if (href === "/admin") return "system";
  if (route === "team" || route === "staff") return "customers";
  if (route === "me") return "schedule";
  return route;
}
