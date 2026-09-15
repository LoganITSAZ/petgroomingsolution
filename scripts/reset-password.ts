/**
 * Reset a staff or customer password from the command line.
 *
 *   npm run staff:password -- <email> <new-password> [--activate]
 *
 * With no arguments it lists the staff emails, so a locked-out admin can see
 * what the account is actually called before guessing at it.
 *
 * A deactivated account stays deactivated: letting a password reset quietly
 * put a leaver back on the floor is how a revoked account comes back. Pass
 * `--activate` to mean it.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const activate = args.includes("--activate");
  const [email, password] = args.filter((arg) => arg !== "--activate");

  if (!email) {
    const staff = await prisma.staff.findMany({
      select: { email: true, name: true, roles: true, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    for (const s of staff) {
      console.log(`${s.email}  ${s.name}  [${s.roles.join(", ")}]${s.isActive ? "" : "  (inactive)"}`);
    }
    console.log("\nUsage: npm run staff:password -- <email> <new-password> [--activate]");
    return;
  }

  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters (the login form rejects shorter).");
  }

  // Every write path lowercases the address, so a lookup on what was typed at
  // a shell turns a working reset into a bare P2025 for anyone whose email is
  // in their address book with a capital letter.
  const existing = await prisma.staff.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { email: true, isActive: true },
  });
  if (!existing) {
    throw new Error(`No staff account for ${email}. Run with no arguments to list them.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const staff = await prisma.staff.update({
    where: { email: existing.email },
    data: { passwordHash, ...(activate ? { isActive: true } : {}) },
    select: { email: true, roles: true, isActive: true },
  });
  console.log(`✓ Password reset for ${staff.email} [${staff.roles.join(", ")}]`);
  if (!staff.isActive) {
    console.log("  Account is deactivated, so it still cannot sign in. Re-run with --activate.");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
