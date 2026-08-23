"use client";

import { useEffect, useRef, useState } from "react";
import { currentShopTime, formatStatus, formatServiceType } from "@/lib/utils";

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
  phone: string | null;
};

type AppointmentData = {
  id: string;
  status: string;
  serviceType: string;
  pet: Pet;
  customer: Customer;
  staff: { name: string } | null;
} | null;

type Station = { id: string; name: string; displayLabel: string | null };

type SSEMessage =
  | { type: "init"; appointment: AppointmentData; station: Station }
  | { type: "status_update"; appointment: AppointmentData; station: Station };

const STATUS_FLOW = [
  "CHECKED_IN",
  "IN_PROGRESS",
  "DRYING",
  "FINISHING",
  "COMPLETE",
  "READY_PICKUP",
  "PICKED_UP",
] as const;

function nextStatus(current: string): string | null {
  const idx = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
  return idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null;
}

async function advanceStatus(appointmentId: string, status: string) {
  await fetch(`/api/appointments/${appointmentId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export default function StationDisplay({
  params,
}: {
  params: { id: string };
}) {
  const [appointment, setAppointment] = useState<AppointmentData>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [advancing, setAdvancing] = useState(false);
  // Empty until mounted: rendering a clock during SSR guarantees a hydration
  // mismatch, and the kiosk needs the time to actually tick.
  const [clock, setClock] = useState("");
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const tick = () => setClock(currentShopTime());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function connect() {
      const es = new EventSource(`/api/station/${params.id}/events`);
      sourceRef.current = es;

      es.onmessage = (e) => {
        const msg: SSEMessage = JSON.parse(e.data);
        setAppointment(msg.appointment);
        setStation(msg.station);
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

  async function handleAdvance() {
    if (!appointment) return;
    const next = nextStatus(appointment.status);
    if (!next) return;
    setAdvancing(true);
    await advanceStatus(appointment.id, next);
    setAdvancing(false);
  }

  const pet = appointment?.pet;
  const next = appointment ? nextStatus(appointment.status) : null;

  return (
    <div className="min-h-screen bg-stone-900 text-white flex flex-col p-6 gap-6 select-none">
      {/* Station header */}
      <div className="flex items-center justify-between">
        <span className="text-stone-400 text-xl font-semibold uppercase tracking-widest">
          {station?.displayLabel ?? station?.name ?? "Station"}
        </span>
        <span className="text-stone-500 text-lg tabular-nums">{clock}</span>
      </div>

      {appointment && pet ? (
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
                  <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl">
                    {pet.species === "CAT" ? "🐱" : "🐶"}
                  </div>
                )}
              </div>

              {/* Identity */}
              <div className="flex-1">
                <h1 className="text-6xl font-black tracking-tight">{pet.name}</h1>
                <p className="text-stone-300 text-2xl mt-1">
                  {pet.breed ?? pet.species}
                  {pet.weightLbs ? ` · ${pet.weightLbs} lbs` : ""}
                </p>
                <p className="text-stone-400 text-xl mt-2">
                  Owner: {appointment.customer.firstName} {appointment.customer.lastName}
                  {appointment.customer.phone ? ` · ${appointment.customer.phone}` : ""}
                </p>
              </div>
            </div>

            {/* Service */}
            <div className="flex gap-4 flex-wrap">
              <span className="bg-brand-600 text-white px-4 py-2 rounded-lg text-xl font-semibold">
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
                <p className="text-stone-300 text-sm uppercase tracking-widest mb-2">Grooming Notes</p>
                <p className="text-white text-xl leading-relaxed">{pet.groomingNotes}</p>
              </div>
            )}
          </div>

          {/* Status + advance button */}
          <div className="flex flex-col gap-4">
            <div className="bg-stone-800 rounded-2xl px-8 py-5 text-center">
              <p className="text-stone-400 text-lg uppercase tracking-widest mb-1">Current Status</p>
              <p className="text-4xl font-bold">{formatStatus(appointment.status)}</p>
            </div>

            {next && (
              <button
                onClick={handleAdvance}
                disabled={advancing}
                className="w-full bg-brand-600 hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50
                           text-white text-3xl font-bold py-8 rounded-2xl transition-colors touch-manipulation"
              >
                {advancing ? "Updating…" : `→ ${formatStatus(next)}`}
              </button>
            )}

            {!next && appointment.status === "PICKED_UP" && (
              <div className="text-center text-stone-400 text-2xl py-6">
                ✓ Complete — waiting for next pet
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-stone-500 gap-4">
          <span className="text-8xl">🐾</span>
          <p className="text-3xl">No pet assigned</p>
          <p className="text-xl">Waiting for next appointment…</p>
        </div>
      )}
    </div>
  );
}
