import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), findStation: vi.fn(), findAppointments: vi.fn(), findAppointment: vi.fn(),
  change: vi.fn(), kennels: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  station: { findUnique: mocks.findStation },
  appointment: { findMany: mocks.findAppointments, findUnique: mocks.findAppointment },
} }));
vi.mock("@/lib/appointment-status", () => ({ changeAppointmentStatus: mocks.change }));
vi.mock("@/lib/kennels", () => ({ getKennelBoard: mocks.kennels }));
vi.mock("@/lib/station-events", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/station-events")>(), subscribeToStation: mocks.subscribe,
}));
const { GET } = await import("./[id]/events/route");
const { POST } = await import("./[id]/advance/route");
const { STATION_APPOINTMENT_SELECT } = await import("@/lib/station-events");
const params = { params: Promise.resolve({ id: "station-1" }) };
const request = () => new NextRequest("http://localhost/api/station/station-1/events");
const advance = () => new Request("http://localhost/api/station/station-1/advance", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: "visit-1" }),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mocks.auth.mockResolvedValue({ user: { id: "staff-1", userType: "staff" } });
  mocks.findStation.mockResolvedValue({ id: "station-1", name: "Table 1", role: "GROOMER" });
  mocks.findAppointments.mockResolvedValue([{ id: "visit-1", customer: { phone: "555-1234" } }]);
  mocks.subscribe.mockReturnValue(mocks.unsubscribe);
});
afterEach(() => { vi.useRealTimers(); });

describe("staff station access", () => {
  it.each([null, { user: { userType: "customer" } }])("blocks non-staff from reading or changing station data: %j", async session => {
    mocks.auth.mockResolvedValue(session);
    expect((await GET(request(), params)).status).toBe(401);
    expect((await POST(advance(), params)).status).toBe(401);
    expect(mocks.findStation).not.toHaveBeenCalled();
    expect(mocks.findAppointment).not.toHaveBeenCalled();
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("streams staff details privately and cleans up when the reader leaves", async () => {
    const response = await GET(request(), params);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const reader = response.body!.getReader();
    const chunk = await reader.read();
    expect(new TextDecoder().decode(chunk.value)).toContain("555-1234");
    expect(mocks.findAppointments).toHaveBeenCalledWith(expect.objectContaining({ select: STATION_APPOINTMENT_SELECT }));
    expect(STATION_APPOINTMENT_SELECT.customer.select).not.toHaveProperty("passwordHash");
    await reader.cancel();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("ends the stream so a reconnect checks the session again", async () => {
    const response = await GET(request(), params);
    const reader = response.body!.getReader();
    await reader.read();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await reader.cancel();
  });
  it("records the signed-in staff member on a status change", async () => {
    mocks.findAppointment.mockResolvedValue({ id: "visit-1", stationId: "station-1", status: "CHECKED_IN" });
    mocks.change.mockResolvedValue({ status: "IN_PROGRESS" });
    expect((await POST(advance(), params)).status).toBe(200);
    expect(mocks.change).toHaveBeenCalledWith(expect.objectContaining({ staffId: "staff-1", status: "IN_PROGRESS" }));
  });
  it("refuses to advance a pet at another station", async () => {
    mocks.findAppointment.mockResolvedValue({ id: "visit-1", stationId: "station-2", status: "CHECKED_IN" });
    expect((await POST(advance(), params)).status).toBe(403);
    expect(mocks.change).not.toHaveBeenCalled();
  });
});
