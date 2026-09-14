"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { currentShopTime, formatStatus, formatServiceType, formatCoatType, formatShopDate, formatShopTime } from "@/lib/utils";
import { nextStatus } from "@/lib/appointment-flow";
import type { StationAppointment } from "@/lib/station-events";

type Station = { id: string; name: string; role: string; isActive: boolean; kennelColumns: number | null };
type Kennel = { id: string; label: string; isActive: boolean; appointments: StationAppointment[] };
type Snapshot = { station: Station; appointments?: StationAppointment[]; kennels?: Kennel[] };
const control = "station-control inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-600 px-4 py-2 text-sm font-semibold hover:bg-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="station-label">{label}</dt><dd className="station-value mt-1 break-words whitespace-pre-wrap">{children ?? "Not recorded"}</dd></div>;
}

function ProfilePhoto({ src, name }: { src: string | null; name: string }) {
  return src ? (
    // Uploaded photos and optional external profile photos are both supported.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name} className="h-20 w-20 shrink-0 rounded-xl object-cover sm:h-28 sm:w-28" />
  ) : null;
}

function VisitDetails({ visit }: { visit: StationAppointment }) {
  const { pet, customer } = visit;
  return (
    <div className="station-details grid gap-4 lg:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr]">
      <section aria-label="Pet information" className="station-panel min-w-0 rounded-2xl bg-stone-800 p-5 space-y-5">
        <div className="station-identity flex items-start gap-4">
          <ProfilePhoto src={pet.photoId ? `/api/photos/${pet.photoId}` : pet.photoUrl} name={pet.name} />
          <div className="min-w-0">
            <p className="station-eyebrow">Pet profile</p>
            <h2 className="station-pet-name font-display font-extrabold">{pet.name}</h2>
            <p className="mt-2 text-stone-300">{pet.breed ?? pet.species} · {pet.sex.toLowerCase()}</p>
          </div>
        </div>
        <dl className="station-facts grid grid-cols-2 gap-4">
          <Detail label="Weight">{pet.weightLbs != null ? `${pet.weightLbs} lbs` : null}</Detail>
          <Detail label="Coat">{pet.coatType ? formatCoatType(pet.coatType) : null}</Detail>
          <Detail label="Date of birth">{pet.dateOfBirth ? formatShopDate(new Date(pet.dateOfBirth)) : null}</Detail>
          <Detail label="Vaccination proof confirmed">{pet.vaccinationsConfirmedAt ? formatShopDate(new Date(pet.vaccinationsConfirmedAt)) : "Not confirmed"}</Detail>
          <Detail label="Profile">{pet.isActive ? "Active" : "Inactive"}</Detail>
          <Detail label="Bite history">{pet.hasBiteHistory ? "Yes — use caution" : "None recorded"}</Detail>
        </dl>
        <div>
          <h3 className="font-bold mb-2">Health alerts</h3>
          {pet.healthFlags.length ? <ul className="flex flex-wrap gap-2">{pet.healthFlags.map(flag => <li key={flag} className="rounded-lg bg-amber-700 px-3 py-2 text-white">{flag}</li>)}</ul> : <p className="text-stone-300">None recorded</p>}
        </div>
        <dl className="space-y-4">
          <Detail label="Handling & temperament">{pet.temperamentNotes}</Detail>
          <Detail label="Standing grooming instructions">{pet.groomingNotes}</Detail>
        </dl>
        <Link className={control} href={`/staff/pets/${pet.id}`}>Pet record & history</Link>
      </section>

      <section aria-label="Current visit" className="station-panel min-w-0 rounded-2xl bg-stone-800 p-5 space-y-5">
        <h2 className="station-section-title font-display text-2xl font-bold">Current visit</h2>
        <dl className="station-facts grid grid-cols-2 gap-4">
          <Detail label="Appointment">{formatShopDate(new Date(visit.scheduledAt))} · {formatShopTime(new Date(visit.scheduledAt))}</Detail>
          <Detail label="Checked in">{visit.checkedInAt ? formatShopTime(new Date(visit.checkedInAt)) : null}</Detail>
          <Detail label="Groomer">{visit.staff?.name}</Detail>
          <Detail label="Estimated duration">{visit.durationMins != null ? `${visit.durationMins} minutes` : null}</Detail>
        </dl>
        <div>
          <h3 className="font-bold mb-2">Booked services</h3>
          <ul className="space-y-3">{visit.services.length ? visit.services.map(item => (
            <li key={item.id} className="station-inset rounded-xl bg-stone-700 p-3">
              <p className="font-semibold">{item.service?.name ?? formatServiceType(item.serviceType)}{item.priceCents != null && <span className="ml-2 text-stone-300">${(item.priceCents / 100).toFixed(2)}</span>}</p>
              {item.service?.staffNotes && <p className="mt-2 whitespace-pre-wrap text-stone-200">{item.service.staffNotes}</p>}
            </li>
          )) : <li>{formatServiceType(visit.serviceType)}</li>}</ul>
        </div>
        <dl><Detail label="Notes for this visit">{visit.visitNotes}</Detail></dl>
        <Link className={control} href={`/staff/appointments/${visit.id}`}>Manage visit & log incident</Link>
      </section>

      <section aria-label="Customer information" className="station-panel min-w-0 rounded-2xl bg-stone-800 p-5 space-y-5 lg:col-span-2 xl:col-span-1">
        <div className="station-identity flex items-start gap-4">
          <ProfilePhoto src={customer.photoId ? `/api/photos/${customer.photoId}` : null} name={`${customer.firstName} ${customer.lastName}`} />
          <div className="min-w-0"><p className="station-eyebrow">Customer</p><h2 className="station-section-title font-display text-2xl font-bold break-words">{customer.firstName} {customer.lastName}</h2></div>
        </div>
        <dl className="space-y-4">
          <Detail label="Phone">{customer.phone ? <a className="underline inline-block py-1" href={`tel:${customer.phone}`}>{customer.phone}</a> : null}</Detail>
          <Detail label="Email"><a className="underline inline-block py-1" href={`mailto:${customer.email}`}>{customer.email}</a></Detail>
          <Detail label="Address">{customer.address}</Detail>
          <Detail label="Text notifications">{customer.smsOptOut ? "Opted out" : "Allowed"}</Detail>
          <Detail label="Preferred groomer">{customer.preferredStaff?.name}</Detail>
          <Detail label="Pricing tier">{customer.pricingTier?.name ?? "Standard pricing"}</Detail>
          <Detail label="Pricing notes">{customer.pricingNotes}</Detail>
          <Detail label="Customer account">{customer.isActive ? "Active" : "Inactive"}</Detail>
        </dl>
        <div>
          <h3 className="font-bold mb-2">Authorized pickup contacts</h3>
          {customer.alternateContacts.length ? <ul className="space-y-3">{customer.alternateContacts.map(contact => <li key={contact.id} className="station-inset rounded-xl bg-stone-700 p-3 break-words">
            <p className="font-semibold">{contact.name}</p>
            {contact.phone && <a className="block py-2 underline" href={`tel:${contact.phone}`}>{contact.phone}</a>}
            {contact.email && <a className="block py-2 underline" href={`mailto:${contact.email}`}>{contact.email}</a>}
          </li>)}</ul> : <p className="text-stone-300">No alternate contacts recorded</p>}
        </div>
        <Link className={control} href={`/staff/customers/${customer.id}`}>Customer record & history</Link>
      </section>
    </div>
  );
}

export default function StationDisplay() {
  const { id } = useParams<{ id: string }>();
  return <StationWorkspace key={id} id={id} />;
}

function StationWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const advancingRef = useRef(false);

  useEffect(() => {
    const tick = () => setClock(currentShopTime());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let disposed = false;
    const es = new EventSource(`/api/station/${id}/events`);
    es.onmessage = event => {
      if (disposed) return;
      try {
        const data: Snapshot = JSON.parse(event.data);
        if (!data.station) return;
        setSnapshot(data);
        setConnected(true);
      } catch {
        setConnected(false);
      }
    };
    es.onerror = async () => {
      if (disposed) return;
      setConnected(false);
      // EventSource reconnects automatically. Check whether a new sign-in is needed.
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;
        const session = await response.json();
        if (!disposed && session?.user?.userType !== "staff") {
          es.close();
          setSnapshot(null);
          router.replace(`/login?type=staff&callbackUrl=${encodeURIComponent(`/station/${id}`)}`);
        }
      } catch { /* Keep the last snapshot visibly offline while wifi reconnects. */ }
    };
    return () => { disposed = true; es.close(); };
  }, [id, router]);

  const station = snapshot?.station;
  const kennels = snapshot?.kennels ?? [];
  const appointments = snapshot?.appointments ?? kennels.flatMap(kennel => kennel.appointments);
  const visit = appointments.find(item => item.id === selectedId) ?? appointments[0];
  const next = visit ? nextStatus(visit.status) : null;

  async function advance() {
    if (!visit || !connected || advancingRef.current) return;
    advancingRef.current = true;
    setAdvancing(true);
    setError(null);
    try {
      const response = await fetch(`/api/station/${id}/advance`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: visit.id }),
      });
      if (response.status === 401) {
        setSnapshot(null);
        router.replace(`/login?type=staff&callbackUrl=${encodeURIComponent(`/station/${id}`)}`);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Could not update this visit. Try again.");
      }
    } catch { setError("No connection to the shop. Try again."); }
    finally { advancingRef.current = false; setAdvancing(false); }
  }

  return (
    <main className="station-hud station-glass liquid-shell min-h-screen bg-stone-900 text-white space-y-4">
      <header className="station-header">
        <div className="station-heading">
          <p className="station-eyebrow">Station workspace</p>
          <h1 className="station-title font-display font-extrabold">{station?.name ?? "Station display"}</h1>
          <div className="station-connection">
            <p role="status" className={connected ? "text-emerald-300" : "text-amber-300"}>
              <span aria-hidden="true" className="station-live-dot" />
              {connected ? "Live updates" : snapshot ? "Reconnecting — showing last received information" : "Connecting to station…"}
            </p>
            {clock && <span className="station-clock">{clock}</span>}
          </div>
        </div>
        <nav aria-label="Station controls" className="station-toolbar flex flex-wrap gap-2">
          <Link className={control} href="/staff/stations">Switch station</Link>
          <Link className={control} href={`/staff/stations/${id}`}>Manage station</Link>
          <button type="button" className={`${control} hidden sm:inline-flex`} onClick={() => {
            const action = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
            action?.catch(() => setError("Full screen is unavailable in this browser."));
          }}>Full screen</button>
        </nav>
      </header>
      {station && !station.isActive && <p className="rounded-xl bg-amber-700 p-4">This station is inactive.</p>}
      {error && <p role="alert" className="rounded-xl bg-red-800 p-4">{error}</p>}
      {station?.role === "KENNEL" && <section aria-label="Kennel doors" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {kennels.map(kennel => <div key={kennel.id} className="rounded-xl bg-stone-800 p-3">
          <h2 className="font-bold text-xl">{kennel.label}</h2>
          {!kennel.isActive ? <p className="text-stone-300">Out of service</p> : !kennel.appointments.length ? <p className="text-stone-300">Empty</p> : null}
          {kennel.appointments.map(item => <button key={item.id} type="button" aria-pressed={visit?.id === item.id} onClick={() => { setSelectedId(item.id); setError(null); }} className={`${control} mt-2 w-full ${visit?.id === item.id ? "bg-stone-600" : ""}`}>{item.pet.name}{item.pet.hasBiteHistory ? " · ⚠ Bite history" : ""}</button>)}
        </div>)}
      </section>}
      {station?.role !== "KENNEL" && appointments.length > 1 && <nav aria-label="Pets at this station" className="flex flex-wrap gap-2">{appointments.map(item => <button type="button" key={item.id} className={control} aria-pressed={visit?.id === item.id} onClick={() => { setSelectedId(item.id); setError(null); }}>{item.pet.name}</button>)}</nav>}
      {visit ? <>
        {visit.pet.hasBiteHistory && <div className="station-warning rounded-xl bg-red-800 px-5 py-4 text-xl font-extrabold">⚠ BITE HISTORY — USE CAUTION</div>}
        <div className="station-progress flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-stone-800 p-4">
          <div className="min-w-0"><p className="station-eyebrow">Right now · {visit.pet.name}</p><p className="station-section-title font-display text-3xl font-bold">{formatStatus(visit.status)}</p></div>
          {next && station?.role !== "KENNEL" && <button type="button" onClick={advance} disabled={advancing || !connected} className="station-advance min-h-14 w-full sm:w-auto rounded-xl bg-brand-600 px-6 py-4 text-xl font-bold text-brand-on-600 disabled:opacity-50 touch-manipulation">{advancing ? "Updating…" : `→ ${formatStatus(next)}`}</button>}
        </div>
        <VisitDetails visit={visit} />
      </> : snapshot ? <section className="station-empty" aria-label="Station ready">
        <div className="station-empty-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none"><rect x="8" y="10" width="32" height="24" rx="5" stroke="currentColor" strokeWidth="2" /><path d="M18 40h12M24 34v6m-7-18 5 5 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <p className="station-eyebrow">{station?.isActive ? "Ready for the next pet" : "Station inactive"}</p>
        <h2 className="font-display text-3xl sm:text-4xl font-bold">No pet assigned</h2>
        <p className="station-empty-description">Customer details, care instructions, and visit progress will appear here when a pet is assigned to this station.</p>
        <Link className={control} href={`/staff/stations/${id}`}>Manage station <span aria-hidden="true" className="ml-2">→</span></Link>
      </section> : <div className="py-20 text-center text-stone-300">Loading the station’s working record…</div>}
    </main>
  );
}
