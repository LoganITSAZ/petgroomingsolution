/**
 * Bring the shop's existing client list in from a spreadsheet saved as CSV.
 *
 *   npm run customers:import -- clients.csv            dry run: reports, writes nothing
 *   npm run customers:import -- clients.csv --commit   imports
 *
 * On the server the file is on the host and this runs in the jobs container,
 * so it reads the CSV from stdin there:
 *
 *   docker compose exec -T jobs npx tsx scripts/import-customers.ts --commit < clients.csv
 *
 * A row per pet with the owner repeated, or a row per customer — rows sharing
 * an email become one customer. Running it again is safe: a customer whose
 * email is already here is never edited, and only pets they do not already
 * have are added. Nobody is emailed or texted.
 */
import { readFileSync } from "fs";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { decodeCsv, parseCsv, planImport } from "../lib/customer-import";

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  const file = args.find((arg) => arg !== "--commit");
  if (!file && process.stdin.isTTY) {
    console.log("Usage: npm run customers:import -- <file.csv> [--commit]");
    console.log("   or: npx tsx scripts/import-customers.ts [--commit] < file.csv");
    process.exitCode = 1;
    return;
  }

  const plan = planImport(parseCsv(decodeCsv(readFileSync(file ?? 0))));
  if (plan.missing.length) {
    throw new Error(`No ${plan.missing.join(" or ")} column. The header row reads: ${plan.header.join(", ")}`);
  }

  console.log("Columns:");
  for (const [field, index] of Object.entries(plan.columns)) console.log(`  ${plan.header[index]} → ${field}`);
  if (plan.ignored.length) console.log(`Ignored: ${plan.ignored.join(", ")}`);
  for (const { row, message } of plan.skipped) console.log(`Skipped row ${row}: ${message}`);
  for (const { row, message } of plan.warnings) console.log(`Row ${row}: ${message}`);

  // Every write path lowercases email, and so does the plan, so this matches.
  const existing = new Map(
    (
      await prisma.customer.findMany({
        where: { email: { in: plan.households.map((household) => household.email) } },
        select: { id: true, email: true, pets: { select: { name: true } } },
      })
    ).map((customer) => [customer.email, customer])
  );
  const fresh = plan.households.filter((household) => !existing.has(household.email));
  const additions = plan.households.flatMap((household) => {
    const customer = existing.get(household.email);
    if (!customer) return [];
    // Inactive pets count too, so a pet the shop retired is not brought back.
    const known = new Set(customer.pets.map((pet) => pet.name.toLowerCase()));
    const pets = household.pets.filter((pet) => !known.has(pet.name.toLowerCase()));
    return pets.length ? [{ customerId: customer.id, pets }] : [];
  });

  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const summary = (create: string, add: string) => {
    const freshPets = fresh.reduce((sum, household) => sum + household.pets.length, 0);
    const addedPets = additions.reduce((sum, addition) => sum + addition.pets.length, 0);
    const untouched = existing.size - additions.length;
    console.log(`\n${create} ${count(fresh.length, "customer")} with ${count(freshPets, "pet")}.`);
    if (additions.length) console.log(`${add} ${count(addedPets, "pet")} to ${count(additions.length, "customer")} already here.`);
    if (untouched) console.log(`${count(untouched, "customer")} already here, nothing new for them.`);
    if (plan.skipped.length) console.log(`${count(plan.skipped.length, "row")} skipped, listed above.`);
    // "Forgot password" is the only way into an imported account, and without
    // email delivery it sends nothing. Staff can still book these customers.
    if (fresh.length && !process.env.RESEND_API_KEY?.trim()) {
      console.log("Email is not set up here (RESEND_API_KEY), so these customers cannot set a portal password until it is.");
    }
  };

  if (!commit) {
    summary("Would create", "Would add");
    console.log("Dry run: nothing was written. Run again with --commit to import.");
    return;
  }

  for (const household of fresh) {
    await prisma.customer.create({
      data: {
        email: household.email,
        firstName: household.firstName,
        lastName: household.lastName,
        phone: household.phone,
        address: household.address,
        /*
         * No portal password, like a customer added at the counter with none:
         * a hash of 32 random bytes nobody keeps, so the account cannot sign
         * in until its owner uses "Forgot password". At bcrypt's minimum cost,
         * because cost only slows guessing a password somebody chose; at the
         * counter's cost a 2,000-household list takes a quarter of an hour.
         */
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 4),
        pets: { create: household.pets },
      },
    });
  }
  for (const { customerId, pets } of additions) {
    await prisma.pet.createMany({ data: pets.map((pet) => ({ ...pet, customerId })) });
  }
  summary("Created", "Added");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
