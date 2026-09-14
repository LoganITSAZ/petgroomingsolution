import { describe, it, expect, vi, beforeEach } from "vitest";
import { ServiceType } from "@prisma/client";

/**
 * POST here is a thin wrapper: parse the body, hand it to createAppointment(),
 * and translate ok/fail into the HTTP response. The booking invariants
 * themselves (line items, rate snapshot, assignment) live in
 * lib/create-appointment.ts and are that module's tests to own, not this
 * route's.
 */

const session = vi.hoisted(() => ({ value: null as unknown }));
const db = vi.hoisted(() => ({
  appointment: { findMany: vi.fn() },
}));
const create = vi.hoisted(() => ({
  createAppointment: vi.fn(),
  APPOINTMENT_INCLUDE: {},
}));

vi.mock("@/lib/auth", () => ({ auth: async () => session.value }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/create-appointment", () => create);

const { POST } = await import("./route");

const STAFF = { user: { id: "staff-1", userType: "staff", roles: ["GROOMER"] } };

function post(body: unknown): Request {
  return new Request("http://localhost/api/appointments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  customerId: "cust-1",
  petId: "pet-1",
  scheduledAt: "2026-08-24T17:00:00.000Z",
  serviceIds: ["svc-1", "svc-2"],
};

const APPOINTMENT = { id: "appt-1" };

beforeEach(() => {
  vi.clearAllMocks();
  session.value = STAFF;
  create.createAppointment.mockResolvedValue({ ok: true, appointment: APPOINTMENT });
});

describe("POST /api/appointments", () => {
  it("refuses an unauthenticated caller", async () => {
    session.value = null;
    expect((await POST(post(VALID))).status).toBe(401);
    expect(create.createAppointment).not.toHaveBeenCalled();
  });

  it("refuses a customer", async () => {
    session.value = { user: { id: "cust-1", userType: "customer", roles: ["CUSTOMER"] } };
    expect((await POST(post(VALID))).status).toBe(403);
    expect(create.createAppointment).not.toHaveBeenCalled();
  });

  it("rejects a body with neither serviceIds nor serviceType", async () => {
    const response = await POST(post({ ...VALID, serviceIds: undefined }));
    expect(response.status).toBe(400);
    expect(create.createAppointment).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric duration instead of passing NaN through", async () => {
    const response = await POST(post({ ...VALID, durationMins: "ninety" }));
    expect(response.status).toBe(400);
    expect(create.createAppointment).not.toHaveBeenCalled();
  });

  it("delegates to createAppointment, skipping customer-facing rules", async () => {
    const response = await POST(post(VALID));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(APPOINTMENT);

    expect(create.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cust-1",
        petId: "pet-1",
        serviceIds: ["svc-1", "svc-2"],
        enforceCustomerRules: false,
        changedById: "staff-1",
      })
    );
  });

  it("passes stationId/staffId as undefined rather than null when absent, so createAppointment derives them", async () => {
    await POST(post(VALID));
    const input = create.createAppointment.mock.calls[0][0];
    expect(input.stationId).toBeUndefined();
    expect(input.staffId).toBeUndefined();
    expect("stationId" in input).toBe(true);
    expect("staffId" in input).toBe(true);
  });

  it("forwards an explicit stationId/staffId unchanged", async () => {
    await POST(post({ ...VALID, stationId: "station-1", staffId: "staff-2" }));
    const input = create.createAppointment.mock.calls[0][0];
    expect(input.stationId).toBe("station-1");
    expect(input.staffId).toBe("staff-2");
  });

  it("still books when only a legacy serviceType is sent", async () => {
    const response = await POST(
      post({ ...VALID, serviceIds: undefined, serviceType: ServiceType.BATH_AND_TIDY })
    );
    expect(response.status).toBe(201);
    expect(create.createAppointment).toHaveBeenCalledWith(
      expect.objectContaining({ serviceType: ServiceType.BATH_AND_TIDY })
    );
  });

  it("answers 404 when createAppointment reports NOT_FOUND", async () => {
    create.createAppointment.mockResolvedValue({
      ok: false,
      code: "NOT_FOUND",
      message: "Customer not found.",
    });
    const response = await POST(post(VALID));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Customer not found.", code: "NOT_FOUND" });
  });

  it("answers 400 for every other refusal code", async () => {
    create.createAppointment.mockResolvedValue({
      ok: false,
      code: "CLOSED_DAY",
      message: "The shop is closed that day.",
    });
    const response = await POST(post(VALID));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "The shop is closed that day.",
      code: "CLOSED_DAY",
    });
  });
});
