/**
 * Reset a staff or customer password from the command line.
 *
 *   npm run staff:password -- <email> <new-password>
 *
 * With no arguments it lists the staff emails, so a locked-out admin can see
 * what the account is actually called before guessing at it.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email) {
    const staff = await prisma.staff.findMany({
      select: { email: true, name: true, roles: true, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    for (const s of staff) {
      console.log(`${s.email}  ${s.name}  [${s.roles.join(", ")}]${s.isActive ? "" : "  (inactive)"}`);
    }
    console.log("\nUsage: npm run staff:password -- <email> <new-password>");
    return;
  }

  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters (the login form rejects shorter).");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await prisma.staff.update({
    where: { email },
    data: { passwordHash, isActive: true },
    select: { email: true, roles: true },
  });
  console.log(`✓ Password reset for ${staff.email} [${staff.roles.join(", ")}]`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
