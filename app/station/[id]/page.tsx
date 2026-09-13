"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { currentShopTime, formatStatus, formatServiceType } from "@/lib/utils";
import { nextStatus } from "@/lib/appointment-flow";

type Pet = {
  name: string;
  species: string;
  breed: string | null;
  weightLbs: number | null;
  groomingNotes: string | null;
  healthFlags: string[];
  hasBiteHistory: boolean;
  photoUrl: string | null;
};

type Customer = {
  firstName: string;
  lastName: string;
};

type AppointmentData = {
  id: string;
  status: string;
  serviceType: string;
  pet: Pet;
  customer: Customer;
  staff: { name: string } | null;
} | null;

type ShopLocation = {
  shopName: string;
  address: string | null;
  embedUrl: string | null;
};

type Station = {
  id: string;
  name: string;
  role: "GROOMER" | "BATHING" | "DRYING" | "KENNEL";
  kennelRows: number | null;
  kennelColumns: number | null;
};

/**
 * A door holds several pets when they come from one household, so the board
 * streams a list per compartment (`getKennelBoard`). This read `appointment`,
 * which the route has never sent, so every door on the kiosk said Empty while
 * the shop screens showed it occupied.
 */
type KennelData = {
  id: string;
  label: string;
  isActive: boolean;
  appointments: {
    id: string;
    status: string;
    pet: { name: string; hasBiteHistory: boolean };
    customer: { firstName: string; lastName: string };
  }[];
};

type Occupant = NonNullable<AppointmentData>;

type SSEMessage =
  | { type: "init"; appointments: Occupant[]; station: Station }
  | { type: "status_update"; appointments: Occupant[]; station: Station }
  | { type: "init"; station: Station; kennels: KennelData[] }
  | { type: "kennel_update"; station: Station; kennels: KennelData[] };

async function advanceStatus(appointmentId: string, status: string) {
  await fetch(`/api/appointments/${appointmentId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export default function StationDisplay() {
  // Next 16 hands a page's `params` over as a promise; the kiosk is a client
// component on React 18, which has no `use()`, so it reads the segment from
  // the router instead.
const params = useParams<{ id: string }>();
  const [appointments, setAppointments] = useState<Occupant[]>([]);
  const [kennels, setKennels] = useState<KennelData[]>([]);
  const [station, setStation] = useState<Station | null>(null);
  const [advancing, setAdvancing] = useState(false);
  // Empty until mounted: rendering a clock during SSR guarantees a hydration
  // mismatch, and the kiosk needs the time to actually tick.
  const [clock, setClock] = useState("");
  // The shop's own location, for the idle screen. Fetched rather than server
  // rendered because this page is a client component.
  const [shopLocation, setShopLocation] = useState<ShopLocation | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const tick = () => setClock(currentShopTime());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/shop-location")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setShopLocation(data))
      // A map is never worth a broken kiosk.
      .catch(() => setShopLocation(null));
  }, []);

  useEffect(() => {
    function connect() {
      const es = new EventSource(`/api/station/${params.id}/events`);
      sourceRef.current = es;

      es.onmessage = (e) => {
        const msg: SSEMessage = JSON.parse(e.data);
        setStation(msg.station);
        // Kennel units stream a whole board; work stations stream one visit.
        if ("kennels" in msg) {
          setKennels(msg.kennels);
        } else {
          setAppointments(msg.appointments ?? []);
        }
      };

      es.onerror = () => {
        es.close();
        // Reconnect after 3s
        setTimeout(connect, 3000);
      };
    }

    connect();
    return () => sourceRef.current?.close();
  }, [params.id]);

  async function handleAdvance(target: Occupant) {
    const next = nextStatus(target.status);
    if (!next) return;
    setAdvancing(true);
    await advanceStatus(target.id, next);
    setAdvancing(false);
  }

  // One pet gets the full-screen card; a station holding several shows them
  // side by side, each with its own advance button.
  const appointment = appointments.length === 1 ? appointments[0] : null;
  const pet = appointment?.pet;
  const next = appointment ? nextStatus(appointment.status) : null;
  const isKennel = station?.role === "KENNEL";
  const occupied = kennels.filter((kennel) => kennel.appointments.length > 0).length;
  const inService = kennels.filter((kennel) => kennel.isActive).length;

  return (
    <div className="min-h-screen bg-stone-900 text-white flex flex-col p-6 gap-6 select-none">
      {/* Station header */}
      <div className="flex items-center justify-between">
        <span className="font-display text-3xl font-extrabold tracking-tight text-white">
          {station?.name ?? "Station"}
        </span>
        <span className="text-stone-300 text-lg tabular-nums">
          {isKennel
            ? `${occupied}/${inService} occupied · `
            : appointments.length > 1
              ? `${appointments.length} pets · `
              : ""}
          {clock}
        </span>
      </div>

      {isKennel ? (
        kennels.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-stone-300 gap-4">
            <span className="text-8xl" aria-hidden="true">🏠</span>
            <p className="text-3xl">No kennels configured</p>
            <p className="text-xl">Set this unit&apos;s layout in the admin panel.</p>
          </div>
        ) : (
          <div
            className="flex-1 grid gap-3 content-start"
            style={{
              gridTemplateColumns: `repeat(${station?.kennelColumns ?? 1}, minmax(0, 1fr))`,
            }}
          >
            {kennels.map((kennel) => {
              const occupants = kennel.appointments;
              const occupant = occupants[0] ?? null;
              const biting = occupants.some((one) => one.pet.hasBiteHistory);
              return (
                <div
                  key={kennel.id}
                  className={`rounded-2xl p-4 flex flex-col gap-1 min-h-[9rem] ${
                    !kennel.isActive
                      ? "bg-stone-800/40 text-stone-300"
                      : occupant
                        ? biting
                          ? "bg-signal-alert/90 text-white"
                          : "bg-stone-800 text-white"
                        : "bg-stone-800/60 text-stone-300"
                  }`}
                >
                  <span className="font-display text-3xl font-extrabold tracking-tight text-white/90">{kennel.label}</span>
                  {!kennel.isActive ? (
                    <span className="text-lg">Out of service</span>
                  ) : occupant ? (
                    <>
                      {/* A household shares a door; the counter needs every
                          name behind it, not just the first one in. */}
                      <span className="font-display text-3xl font-extrabold leading-tight tracking-tight">
                        {occupants.map((one) => one.pet.name).join(", ")}
                      </span>
                      <span className="text-lg text-stone-300">
                        {occupant.customer.firstName} {occupant.customer.lastName}
                      </span>
                      <span className="text-base text-stone-300 mt-auto">
                        {formatStatus(occupant.status)}
                      </span>
                      {biting && (
                        <span className="text-base font-black tracking-widest">⚠ BITE HISTORY</span>
                      )}
                    </>
                  ) : (
                    <span className="text-2xl mt-auto">Empty</span>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : appointments.length > 1 ? (
        <div className="flex-1 grid gap-3 content-start sm:grid-cols-2 lg:grid-cols-3">
          {appointments.map((occupant) => {
            const step = nextStatus(occupant.status);
            return (
              <div
                key={occupant.id}
                className={`rounded-2xl p-5 flex flex-col gap-2 ${
                  occupant.pet.hasBiteHistory ? "bg-signal-alert/90" : "bg-stone-800"
                }`}
              >
                <span className="font-display text-4xl font-extrabold leading-tight tracking-tight">{occupant.pet.name}</span>
                <span className="text-xl text-stone-300">
                  {occupant.customer.firstName} {occupant.customer.lastName}
                </span>
                <span className="text-lg text-stone-300">
                  {formatServiceType(occupant.serviceType)}
                  {occupant.staff && ` · ${occupant.staff.name}`}
                </span>
                {occupant.pet.hasBiteHistory && (
                  <span className="text-lg font-black tracking-widest">⚠ BITE HISTORY</span>
                )}
                <span className="text-2xl font-bold mt-auto">
                  {formatStatus(occupant.status)}
                </span>
                {step && (
                  <button
                    type="button"
                    onClick={() => handleAdvance(occupant)}
                    disabled={advancing}
                    className="bg-brand-600 hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50
                               text-brand-on-600 text-xl font-bold py-4 rounded-xl transition-colors touch-manipulation"
                  >
                    {advancing ? "Updating…" : `→ ${formatStatus(step)}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : appointment && pet ? (
        <>
          {/* Bite history warning */}
          {pet.hasBiteHistory && (
            <div className="bite-warning text-2xl py-4">
              ⚠ BITE HISTORY — USE CAUTION
            </div>
          )}

          {/* Main pet card */}
          <div className="flex-1 bg-stone-800 rounded-2xl p-8 flex flex-col gap-6">
            <div className="flex items-start gap-6">
              {/* Photo */}
              <div className="w-32 h-32 rounded-xl bg-stone-700 overflow-hidden flex-shrink-0">
                {pet.photoUrl ? (
                  // Plain <img>: photoUrl is an arbitrary external address the
                  // shop typed in, so next/image would need a remotePatterns
                  // entry per host. The kiosk is one Pi on the shop's LAN
                  // showing one 128px thumbnail — optimisation buys nothing.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl" aria-hidden="true">
                    {pet.species === "CAT" ? "🐱" : "🐶"}
                  </div>
                )}
              </div>

              {/* Identity */}
              <div className="flex-1">
                <h1 className="font-display text-6xl font-extrabold tracking-[-0.03em]">{pet.name}</h1>
                <p className="text-stone-300 text-2xl mt-1">
                  {pet.breed ?? pet.species}
                  {pet.weightLbs ? ` · ${pet.weightLbs} lbs` : ""}
                </p>
                {/* Name only. This screen faces the waiting room, so a phone
                    number here is readable by every customer waiting. Staff
                    read it from /staff/stations/[id] instead. */}
                <p className="text-stone-300 text-xl mt-2">
                  Owner: {appointment.customer.firstName} {appointment.customer.lastName}
                </p>
              </div>
            </div>

            {/* Service */}
            <div className="flex gap-4 flex-wrap">
              <span className="bg-brand-600 text-brand-on-600 px-4 py-2 rounded-lg text-xl font-semibold">
                {formatServiceType(appointment.serviceType)}
              </span>
              {pet.healthFlags.map((flag) => (
                <span key={flag} className="bg-amber-700 text-white px-4 py-2 rounded-lg text-lg">
                  {flag}
                </span>
              ))}
            </div>

            {/* Grooming notes */}
            {pet.groomingNotes && (
              <div className="bg-stone-700 rounded-xl p-5">
                <p className="font-display text-lg font-bold text-stone-300 mb-2">Grooming notes</p>
                <p className="text-white text-xl leading-relaxed">{pet.groomingNotes}</p>
              </div>
            )}
          </div>

          {/* Status + advance button */}
          <div className="flex flex-col gap-4">
            <div className="bg-stone-800 rounded-2xl px-8 py-5 text-center">
              <p className="text-stone-300 text-lg mb-1">Right now</p>
              <p className="font-display text-4xl font-extrabold tracking-tight">
                {formatStatus(appointment.status)}
              </p>
            </div>

            {next && (
              <button
                type="button"
                onClick={() => handleAdvance(appointment)}
                disabled={advancing}
                className="w-full bg-brand-600 hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50
                           text-brand-on-600 text-3xl font-bold py-8 rounded-2xl transition-colors touch-manipulation"
              >
                {advancing ? "Updating…" : `→ ${formatStatus(next)}`}
              </button>
            )}

            {!next && appointment.status === "PICKED_UP" && (
              <div className="text-center text-stone-300 text-2xl py-6">
                ✓ Complete — waiting for next pet
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-stone-300 gap-4">
          <span className="text-8xl" aria-hidden="true">🐾</span>
          <p className="text-3xl">No pet assigned</p>
          <p className="text-xl">Waiting for next appointment…</p>

          {shopLocation?.address && (
            <div className="mt-4 w-full max-w-2xl text-center">
              <p className="text-2xl text-stone-200">{shopLocation.shopName}</p>
              <p className="text-xl text-stone-300 mt-1">{shopLocation.address}</p>
              {shopLocation.embedUrl && (
                <div className="mt-3 rounded-2xl overflow-hidden border border-stone-700">
                  <iframe
                    title={`Map showing ${shopLocation.shopName}`}
                    src={shopLocation.embedUrl}
                    height={260}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full block border-0"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
