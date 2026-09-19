import { beforeEach, expect, it, vi } from "vitest";
import { assignLifecycleDestination } from "./lifecycle-actions";

const mocks = vi.hoisted(() => ({
  appointment: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  station: { findUnique: vi.fn() }, kennel: { findUnique: vi.fn() },
  requireStaff: vi.fn(), broadcast: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: typeof mocks) => unknown) => fn(mocks) } }));
vi.mock("@/lib/auth-guards", () => ({ requireStaff: mocks.requireStaff }));
vi.mock("@/lib/appointment-status", () => ({ broadcastStationBoard: mocks.broadcast }));
vi.mock("@/lib/kennels", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/kennels")>(), broadcastKennelBoard: mocks.broadcast,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaff.mockResolvedValue("staff1");
  mocks.appointment.findUnique.mockResolvedValue({ status: "SCHEDULED", customerId: "owner1", stationId: null, kennel: null, staff: { name: "Alex", roles: ["GROOMER"] } });
  mocks.appointment.count.mockResolvedValue(0);
  mocks.appointment.findMany.mockResolvedValue([]);
  mocks.station.findUnique.mockResolvedValue({ id: "s1", name: "Bath 1", role: "BATHING", isActive: true, allowedRoles: [] });
  mocks.kennel.findUnique.mockResolvedValue({ id: "k1", label: "A1", isActive: true, stationId: "bank1", station: { name: "Bank 1", role: "KENNEL", isActive: true, kennelCapacityPerCompartment: 1, kennelHouseholdMaxPerCompartment: 2 } });
});

it("checks an arrival in and starts bathing in one assignment", async () => {
  expect(await assignLifecycleDestination("a1", "station:s1")).toEqual({ ok: true, columnKey: "bath" });
  expect(mocks.requireStaff).toHaveBeenCalled();
  const data = mocks.appointment.update.mock.calls[0][0].data;
  expect(data).toMatchObject({ stationId: "s1", kennelId: null, status: "IN_PROGRESS", checkedInAt: expect.any(Date) });
  expect(data.statusHistory.create.map((row: { status: string }) => row.status)).toEqual(["CHECKED_IN", "IN_PROGRESS"]);
});

it("assigns an arrival to a kennel in Waiting", async () => {
  expect(await assignLifecycleDestination("a1", "kennel:k1")).toEqual({ ok: true, columnKey: "waiting" });
  expect(mocks.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kennelId: "k1", stationId: null, status: "CHECKED_IN" }) }));
});

it("moves a waiting pet to grooming and releases its kennel", async () => {
  const checkedInAt = new Date("2026-09-17T10:00:00Z");
  mocks.appointment.findUnique.mockResolvedValue({ status: "CHECKED_IN", customerId: "owner1", checkedInAt, kennel: { stationId: "bank1" }, stationId: null });
  mocks.station.findUnique.mockResolvedValue({ name: "Table 1", role: "GROOMER", isActive: true, allowedRoles: [] });
  expect(await assignLifecycleDestination("a1", "station:s1")).toEqual({ ok: true, columnKey: "grooming" });
  expect(mocks.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FINISHING", kennelId: null, checkedInAt }) }));
  expect(mocks.broadcast).toHaveBeenCalledWith("bank1");
});

it("refuses occupied stations before checking in", async () => {
  mocks.appointment.count.mockResolvedValue(1);
  expect((await assignLifecycleDestination("a1", "station:s1")).ok).toBe(false);
  expect(mocks.appointment.update).not.toHaveBeenCalled();
});

it("refuses full kennels but respects household sharing", async () => {
  mocks.appointment.findMany.mockResolvedValue([{ customerId: "someone-else" }]);
  expect((await assignLifecycleDestination("a1", "kennel:k1")).ok).toBe(false);
  expect(mocks.appointment.update).not.toHaveBeenCalled();
  mocks.appointment.findMany.mockResolvedValue([{ customerId: "owner1" }]);
  expect((await assignLifecycleDestination("a1", "kennel:k1")).ok).toBe(true);
});

it("rejects incompatible staff and stale appointment states", async () => {
  mocks.station.findUnique.mockResolvedValue({ name: "Bath 1", role: "BATHING", isActive: true, allowedRoles: ["BATHER"] });
  expect((await assignLifecycleDestination("a1", "station:s1")).ok).toBe(false);
  mocks.appointment.findUnique.mockResolvedValue({ status: "PICKED_UP" });
  expect((await assignLifecycleDestination("a1", "kennel:k1")).ok).toBe(false);
  expect(mocks.appointment.update).not.toHaveBeenCalled();
});
