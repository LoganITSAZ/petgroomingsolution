import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppointmentStatus, AppointmentType, ServiceType } from "@prisma/client";

/**
 * The booking rules this route has to keep are documented invariants, not
 * details: a visit carries line items or it is invisible to the service mix
 * and to revenue, and every booking path snapshots the customer's negotiated
 * rate so a later edit to the tier cannot reprice what was quoted.
 *
 * Both were missing here — the route wrote `serviceType` alone — so they are
 * pinned down rather than left to review.
 */

const session = vi.hoisted(() => ({ value: null as unknown }));
const db = vi.hoisted(() => ({
  customer: { findUnique: vi.fn() },
  pet: { findUnique: vi.fn() },
  station: { findUnique: vi.fn() },
  staff: { findUnique: vi.fn() },
  service: { findFirst: vi.fn() },
  appointment: { create: vi.fn(), findMany: vi.fn() },
  appointmentStatusHistory: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const services = vi.hoisted(() => ({ resolveSelectedServices: vi.fn() }));
const tiers = vi.hoisted(() => ({ bookingRateSnapshot: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: async () => session.value }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/appointment-services", () => services);
vi.mock("@/lib/pricing-tiers", () => tiers);

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

beforeEach(() => {
  vi.clearAllMocks();
  session.value = STAFF;

  db.customer.findUnique.mockResolvedValue({ id: "cust-1" });
  db.pet.findUnique.mockResolvedValue({ id: "pet-1", customerId: "cust-1" });
  db.appointment.create.mockImplementation(async (args: { data: unknown }) => ({
    id: "appt-1",
    ...(args.data as object),
  }));
  db.appointmentStatusHistory.create.mockResolvedValue({});
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));

  services.resolveSelectedServices.mockResolvedValue({
    primaryType: ServiceType.FULL_GROOM,
    totalDurationMins: 90,
    lines: [
      { serviceId: "svc-1", serviceType: ServiceType.FULL_GROOM, priceCents: 6000, sortOrder: 0 },
      { serviceId: "svc-2", serviceType: ServiceType.NAIL_TRIM, priceCents: 1500, sortOrder: 1 },
    ],
  });
  tiers.bookingRateSnapshot.mockResolvedValue({
    pricingTierId: "tier-1",
    pricingDiscountCents: 750,
  });
});

describe("POST /api/appointments", () => {
  it("refuses an unauthenticated caller", async () => {
    session.value = null;
    expect((await POST(post(VALID))).status).toBe(401);
  });

  it("refuses a customer", async () => {
    session.value = { user: { id: "cust-1", userType: "customer", roles: ["CUSTOMER"] } };
    expect((await POST(post(VALID))).status).toBe(403);
  });

  it("writes a line item for every service chosen", async () => {
    const response = await POST(post(VALID));
    expect(response.status).toBe(201);

    const { data } = db.appointment.create.mock.calls[0][0];
    expect(data.services.create).toHaveLength(2);
    expect(data.services.create[0]).toMatchObject({ serviceId: "svc-1", priceCents: 6000 });
    // The first service chosen is the primary one the older screens read.
    expect(data.serviceType).toBe(ServiceType.FULL_GROOM);
    expect(data.status).toBe(AppointmentStatus.SCHEDULED);
    expect(data.appointmentType).toBe(AppointmentType.APPOINTMENT);
  });

  it("snapshots the customer's negotiated rate onto the visit", async () => {
    await POST(post(VALID));

    expect(tiers.bookingRateSnapshot).toHaveBeenCalledWith("cust-1", [
      expect.objectContaining({ priceCents: 6000 }),
      expect.objectContaining({ priceCents: 1500 }),
    ]);
    const { data } = db.appointment.create.mock.calls[0][0];
    expect(data.pricingTierId).toBe("tier-1");
    expect(data.pricingDiscountCents).toBe(750);
  });

  it("takes the duration from the services when none is given", async () => {
    await POST(post(VALID));
    expect(db.appointment.create.mock.calls[0][0].data.durationMins).toBe(90);
  });

  it("still books when only a legacy serviceType is sent", async () => {
    services.resolveSelectedServices.mockResolvedValue(null);
    db.service.findFirst.mockResolvedValue({
      id: "svc-9",
      type: ServiceType.BATH_AND_TIDY,
      priceSmallCents: 3000,
    });

    const response = await POST(
      post({ ...VALID, serviceIds: undefined, serviceType: ServiceType.BATH_AND_TIDY })
    );
    expect(response.status).toBe(201);

    // The catalog row stands in, so the visit is not left without a line.
    const { data } = db.appointment.create.mock.calls[0][0];
    expect(data.services.create).toHaveLength(1);
    expect(data.services.create[0].serviceId).toBe("svc-9");
  });

  it("rejects a body with neither serviceIds nor serviceType", async () => {
    const response = await POST(post({ ...VALID, serviceIds: undefined }));
    expect(response.status).toBe(400);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric duration instead of passing NaN to the database", async () => {
    const response = await POST(post({ ...VALID, durationMins: "ninety" }));
    expect(response.status).toBe(400);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("answers 400 for a station that does not exist", async () => {
    db.station.findUnique.mockResolvedValue(null);
    const response = await POST(post({ ...VALID, stationId: "nope" }));
    expect(response.status).toBe(400);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });

  it("refuses a pet belonging to another customer", async () => {
    db.pet.findUnique.mockResolvedValue({ id: "pet-1", customerId: "someone-else" });
    const response = await POST(post(VALID));
    expect(response.status).toBe(400);
    expect(db.appointment.create).not.toHaveBeenCalled();
  });
});
