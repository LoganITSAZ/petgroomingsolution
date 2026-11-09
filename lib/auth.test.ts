import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deactivating an account has to end its session, not wait for a cookie that
 * every visit re-signs. NextAuth is mocked so the config lib/auth.ts builds can
 * be read back and its jwt callback called directly; Prisma is mocked as in
 * password-reset.test.ts.
 */

type Jwt = (params: { token: Record<string, unknown>; user?: Record<string, unknown> }) => Promise<unknown>;

const state = vi.hoisted(() => ({
  jwt: null as unknown as Jwt,
  staff: new Map<string, { isActive: boolean }>(),
  customers: new Map<string, { isActive: boolean }>(),
}));

// React 18's package has no `cache`; Next supplies its own React at runtime.
vi.mock("react", async (original) => ({ ...(await original<object>()), cache: <T>(fn: T) => fn }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("next-auth", () => ({
  default: (config: { callbacks: { jwt: Jwt } }) => {
    state.jwt = config.callbacks.jwt;
    return {};
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    staff: { findUnique: async ({ where }: { where: { id: string } }) => state.staff.get(where.id) ?? null },
    customer: {
      findUnique: async ({ where }: { where: { id: string } }) => state.customers.get(where.id) ?? null,
    },
  },
}));

await import("@/lib/auth");

describe("the session follows the account", () => {
  beforeEach(() => {
    state.staff.clear();
    state.customers.clear();
  });

  it("keeps an active account signed in", async () => {
    state.staff.set("s1", { isActive: true });
    state.customers.set("c1", { isActive: true });
    expect(await state.jwt({ token: { id: "s1", userType: "staff" } })).toMatchObject({ id: "s1" });
    expect(await state.jwt({ token: { id: "c1", userType: "customer" } })).toMatchObject({ id: "c1" });
  });

  it("ends the session of a deactivated or deleted account", async () => {
    state.staff.set("s1", { isActive: false });
    expect(await state.jwt({ token: { id: "s1", userType: "staff" } })).toBeNull();
    expect(await state.jwt({ token: { id: "gone", userType: "staff" } })).toBeNull();
  });

  it("reads each kind of account from its own table", async () => {
    // A customer id that happens to exist among staff is still a customer.
    state.staff.set("x1", { isActive: true });
    expect(await state.jwt({ token: { id: "x1", userType: "customer" } })).toBeNull();
  });

  it("trusts sign-in, which has just checked the account itself", async () => {
    const user = { id: "s2", roles: ["GROOMER"], userType: "staff" };
    expect(await state.jwt({ token: {}, user })).toMatchObject({ id: "s2", userType: "staff" });
  });
});
