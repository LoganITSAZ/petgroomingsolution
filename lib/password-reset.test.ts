import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The reset flow is the one place in the app where an email address turns into
 * a way into somebody's account, so the properties below are the ones worth
 * pinning down: the token is never stored, a link is spent once, and asking
 * about an address tells the asker nothing.
 *
 * Prisma and Resend are mocked — this is the arithmetic of the flow, not a
 * database test.
 */

type Row = {
  id: string;
  tokenHash: string;
  subject: "CUSTOMER" | "STAFF";
  subjectId: string;
  expiresAt: Date;
  usedAt: Date | null;
};

const db = {
  resets: [] as Row[],
  customers: [] as { id: string; firstName: string; email: string; isActive: boolean; passwordHash: string }[],
  staff: [] as { id: string; name: string; email: string; isActive: boolean; passwordHash: string }[],
};

let nextId = 0;

const sent: { to: string; url: string }[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // The transaction is a list of already-started operations; awaiting them is
    // enough to exercise the ordering this module depends on.
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    customer: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
        db.customers.find((c) => c.email === where.email || c.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { passwordHash: string } }) => {
        const row = db.customers.find((c) => c.id === where.id)!;
        row.passwordHash = data.passwordHash;
        return row;
      },
    },
    staff: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) =>
        db.staff.find((s) => s.email === where.email || s.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { passwordHash: string } }) => {
        const row = db.staff.find((s) => s.id === where.id)!;
        row.passwordHash = data.passwordHash;
        return row;
      },
    },
    passwordReset: {
      create: async ({ data }: { data: Omit<Row, "id" | "usedAt"> }) => {
        const row: Row = { ...data, id: `reset-${nextId++}`, usedAt: null };
        db.resets.push(row);
        return row;
      },
      findUnique: async ({ where }: { where: { tokenHash: string } }) =>
        db.resets.find((r) => r.tokenHash === where.tokenHash) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { usedAt: Date } }) => {
        const row = db.resets.find((r) => r.id === where.id)!;
        row.usedAt = data.usedAt;
        return row;
      },
      deleteMany: async ({ where }: { where: { subject: string; subjectId: string; usedAt: null } }) => {
        const keep = db.resets.filter(
          (r) => !(r.subject === where.subject && r.subjectId === where.subjectId && r.usedAt === null)
        );
        const count = db.resets.length - keep.length;
        db.resets = keep;
        return { count };
      },
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendPasswordReset: async ({ to, url }: { to: string; url: string }) => {
    sent.push({ to, url });
  },
}));

const { requestPasswordReset, consumePasswordReset, inspectResetToken } = await import(
  "./password-reset"
);

/** The token as the customer receives it, dug back out of the link. */
function tokenFromLastMail(): string {
  return new URL(sent[sent.length - 1].url).searchParams.get("token")!;
}

beforeEach(() => {
  db.resets = [];
  db.customers = [
    { id: "cust-1", firstName: "Dana", email: "dana@example.com", isActive: true, passwordHash: "old" },
    { id: "cust-2", firstName: "Gone", email: "gone@example.com", isActive: false, passwordHash: "old" },
  ];
  db.staff = [
    { id: "staff-1", name: "Rey", email: "rey@shop.test", isActive: true, passwordHash: "old" },
  ];
  sent.length = 0;
  nextId = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requestPasswordReset", () => {
  it("mails a link and stores only its hash", async () => {
    await requestPasswordReset("dana@example.com", "customer");

    expect(sent).toHaveLength(1);
    const token = tokenFromLastMail();
    expect(db.resets).toHaveLength(1);
    // The whole point: what went out in the mail is not what is on disk.
    expect(db.resets[0].tokenHash).not.toBe(token);
    expect(db.resets[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the address however it was typed", async () => {
    await requestPasswordReset("  DANA@Example.com ", "customer");
    expect(sent).toHaveLength(1);
  });

  it("says nothing and mails nothing for an address that is not on file", async () => {
    await requestPasswordReset("nobody@example.com", "customer");
    expect(sent).toHaveLength(0);
    expect(db.resets).toHaveLength(0);
  });

  it("is not a way back into a deactivated account", async () => {
    await requestPasswordReset("gone@example.com", "customer");
    expect(sent).toHaveLength(0);
  });

  it("looks in the table the caller named, not both", async () => {
    // A staff address must not resolve on the customer form.
    await requestPasswordReset("rey@shop.test", "customer");
    expect(sent).toHaveLength(0);

    await requestPasswordReset("rey@shop.test", "staff");
    expect(sent).toHaveLength(1);
  });

  it("retires the previous link when a second one is asked for", async () => {
    await requestPasswordReset("dana@example.com", "customer");
    const first = tokenFromLastMail();
    await requestPasswordReset("dana@example.com", "customer");
    const second = tokenFromLastMail();

    expect(first).not.toBe(second);
    expect(db.resets).toHaveLength(1);
    expect(await inspectResetToken(first)).toBe("invalid");
    expect(await inspectResetToken(second)).toBe("ok");
  });
});

describe("consumePasswordReset", () => {
  it("sets the new password and spends the link", async () => {
    await requestPasswordReset("dana@example.com", "customer");
    const token = tokenFromLastMail();

    const result = await consumePasswordReset(token, "a-good-password");
    expect(result).toEqual({ ok: true, subject: "customer" });
    expect(db.customers[0].passwordHash).not.toBe("old");
  });

  it("refuses the same link twice", async () => {
    await requestPasswordReset("dana@example.com", "customer");
    const token = tokenFromLastMail();

    await consumePasswordReset(token, "a-good-password");
    const again = await consumePasswordReset(token, "another-password");

    expect(again).toEqual({ ok: false, reason: "used" });
    expect(await inspectResetToken(token)).toBe("used");
  });

  it("refuses a link that has expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T10:00:00Z"));
    await requestPasswordReset("dana@example.com", "customer");
    const token = tokenFromLastMail();

    // The link lasts an hour.
    vi.setSystemTime(new Date("2026-09-13T11:00:01Z"));
    expect(await inspectResetToken(token)).toBe("expired");
    expect(await consumePasswordReset(token, "a-good-password")).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(db.customers[0].passwordHash).toBe("old");
  });

  it("refuses a token nobody issued", async () => {
    expect(await consumePasswordReset("made-up", "a-good-password")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("refuses a password too short to be one, before touching the account", async () => {
    await requestPasswordReset("dana@example.com", "customer");
    const token = tokenFromLastMail();

    expect(await consumePasswordReset(token, "short")).toEqual({ ok: false, reason: "weak" });
    expect(db.customers[0].passwordHash).toBe("old");
    // The link survives, so the visitor can try again with a longer one.
    expect(await inspectResetToken(token)).toBe("ok");
  });

  it("resets a staff password through the same path", async () => {
    await requestPasswordReset("rey@shop.test", "staff");
    const result = await consumePasswordReset(tokenFromLastMail(), "a-good-password");

    expect(result).toEqual({ ok: true, subject: "staff" });
    expect(db.staff[0].passwordHash).not.toBe("old");
    expect(db.customers[0].passwordHash).toBe("old");
  });
});
