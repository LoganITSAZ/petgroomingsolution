/**
 * Demo data for a throwaway test database.
 *
 * Generates a shop that has been open for a while: customers with pets, a few
 * groomers, and appointments spread from three months back to three weeks out,
 * with status history behind the finished ones. Run it against a TEST database
 * only — it creates rows, it does not upsert, and running it twice doubles
 * everything.
 *
 *   npm run db:demo          (uses DATABASE_URL)
 *
 * Deterministic: same seed, same shop, so a screenshot from yesterday still
 * matches. Pass a different seed as the first argument for a different shop.
 */
import { PrismaClient, Prisma, AppointmentStatus, StaffRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ADMIN_EMAIL } from "../lib/branding";

// ── refuse to run against a real shop ────────────────────────────────────────
// This file writes hundreds of fake customers and never cleans up. The only
// safe target is a scratch database, so the name has to say so. To point it
// somewhere else on purpose, set DEMO_ALLOW_DB to that database's exact name.
function assertScratchDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  const allowed = /(^|[_-])(test|demo|scratch|sandbox)([_-]|$)/i.test(name);
  if (allowed || name === process.env.DEMO_ALLOW_DB) return name;
  throw new Error(
    `Refusing to write demo data into "${name}" — it does not look like a test database.\n` +
      `Use \`npm run db:test:reset\` (builds gentlegroomer_test), or set DEMO_ALLOW_DB="${name}" if you really mean it.`
  );
}

let targetDatabase: string;
try {
  targetDatabase = assertScratchDatabase();
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exit(1);
}

const prisma = new PrismaClient();

// ── deterministic RNG ────────────────────────────────────────────────────────
// ponytail: mulberry32, plenty for demo data. Not for anything that matters.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = rng(Number(process.argv[2]) || 20260825);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(random() * xs.length)];
const pickSome = <T,>(xs: readonly T[], n: number): T[] =>
  [...xs].sort(() => random() - 0.5).slice(0, n);
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const chance = (p: number) => random() < p;

// ── name pools ───────────────────────────────────────────────────────────────
const FIRST = ["Maria", "James", "Aisha", "Diego", "Chen", "Sarah", "Tom", "Priya", "Luis",
  "Hannah", "Marcus", "Nina", "Omar", "Grace", "Ethan", "Rosa", "Kai", "Beth", "Andre",
  "Leah", "Victor", "Dana", "Sam", "Ivy", "Noah", "Carla", "Pete", "Yuki", "Frank", "Mei"];
const LAST = ["Alvarez", "Bennett", "Cho", "Delgado", "Ellis", "Farah", "Gomez", "Hale",
  "Ito", "Jensen", "Kaur", "Lopez", "Moreno", "Nakamura", "Okafor", "Patel", "Quinn",
  "Reyes", "Silva", "Tran", "Ueda", "Vargas", "Walsh", "Xu", "Young", "Zhang"];
const DOG_NAMES = ["Biscuit", "Cooper", "Luna", "Bear", "Daisy", "Milo", "Sadie", "Tucker",
  "Bella", "Rocky", "Nala", "Finn", "Poppy", "Gus", "Willow", "Ziggy", "Maple", "Otis",
  "Juno", "Rusty", "Olive", "Bruno", "Pepper", "Scout", "Waffles"];
const CAT_NAMES = ["Mochi", "Simba", "Cleo", "Pumpkin", "Jasper", "Miso", "Nimbus", "Tofu"];
const DOG_BREEDS = ["Poodle", "Goldendoodle", "Golden Retriever", "German Shepherd",
  "Shih Tzu", "Yorkshire Terrier", "Labrador Retriever", "Australian Shepherd",
  "Schnauzer", "Maltese", "Border Collie", "Corgi", "Cockapoo"];
const CAT_BREEDS = ["Persian", "Domestic Shorthair", "Maine Coon", "Ragdoll"];
const STREETS = ["N Central Ave", "E Camelback Rd", "W Indian School Rd", "N 7th St",
  "E Thomas Rd", "N 24th St", "W Bethany Home Rd", "E Osborn Rd"];
const TEMPERAMENT = ["Nervous with the dryer, fine once it is off.", "Loves everybody.",
  "Does not like her feet touched.", "Settles best on the far table.",
  "Barky for the first ten minutes, then quiet.", "Older, needs breaks.", null, null];
const GROOMING_NOTES = ["Short on the body, leave the tail.", "Teddy bear face.",
  "Owner asks for a sanitary trim every visit.", "No clippers on the face — scissors only.",
  "Half inch all over.", null, null];
const HEALTH_FLAGS = [["elderly"], ["allergy:chicken"], ["reactive"], ["arthritis"], [], [], []];

// ── shop wall clock ──────────────────────────────────────────────────────────
// Phoenix does not observe DST, so a fixed +7 is correct all year. Anywhere
// else this would need a real timezone conversion.
const SHOP_UTC_OFFSET = 7;
function shopTime(daysFromToday: number, hour: number, minute = 0): Date {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + daysFromToday);
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(),
    hour + SHOP_UTC_OFFSET, minute));
}

async function main() {
  const [config, services, stations] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: "global" } }),
    prisma.service.findMany({ where: { isActive: true } }),
    prisma.station.findMany({ where: { isActive: true } }),
  ]);
  if (!config || services.length === 0 || stations.length === 0) {
    throw new Error("Run `npm run db:seed` first — demo data builds on the catalog and stations.");
  }

  // A kennel bank, if the shop has none yet: kennels are stations too, and the
  // capacity screens have nothing to show without one.
  let kennelStation = stations.find((s) => s.role === "KENNEL");
  if (!kennelStation) {
    kennelStation = await prisma.station.create({
      data: { name: "Kennel Bank A", role: "KENNEL", kennelRows: 6, kennelColumns: 8 },
    });
    await prisma.kennel.createMany({
      data: Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 8 }, (_, col) => ({
          stationId: kennelStation!.id,
          label: `${String.fromCharCode(65 + r)}${col + 1}`,
          row: r + 1,
          column: col + 1,
        }))
      ).flat(),
    });
  }
  const kennels = await prisma.kennel.findMany({ where: { stationId: kennelStation.id } });
  let freeKennels = [...kennels];

  const workStations = stations.filter((s) => s.role !== "KENNEL");
  const dogServices = services.filter((s) => s.species !== "CAT");
  const catServices = services.filter((s) => s.species !== "DOG");
  const addOns = services.filter((s) => s.walkInEligible);

  // One hash for everybody: bcrypt at cost 12 is the slowest thing here.
  const passwordHash = await bcrypt.hash("demo1234", 12);

  // ── the real shop's admins ─────────────────────────────────────────────────
  // Signing in to the test instance should take the same credentials as the
  // real one, so the admin accounts are mirrored across — email, password hash
  // and roles. Passwords diverge the moment either side is reset; that is the
  // point at which they are meant to.
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  if (sourceUrl && sourceUrl !== process.env.DATABASE_URL) {
    const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
    try {
      const admins = await source.staff.findMany({
        where: { roles: { hasSome: ["ADMIN", "MANAGER"] } },
        select: { name: true, email: true, passwordHash: true, roles: true },
      });
      for (const admin of admins) {
        await prisma.staff.upsert({
          where: { email: admin.email },
          update: { passwordHash: admin.passwordHash, roles: admin.roles },
          create: admin,
        });
      }
      // The seed's first-boot account is only there because the test database
      // started empty. Once the real admins are here, it is a second password
      // to keep track of.
      if (admins.length > 0 && !admins.some((a) => a.email === DEFAULT_ADMIN_EMAIL)) {
        await prisma.staff.deleteMany({ where: { email: DEFAULT_ADMIN_EMAIL } });
      }
      console.log(`✓ mirrored ${admins.length} admin login(s) from the working database`);
    } catch (error) {
      console.warn(`⚠ could not read admins from SOURCE_DATABASE_URL: ${(error as Error).message}`);
    } finally {
      await source.$disconnect();
    }
  }

  // ── staff ──────────────────────────────────────────────────────────────────
  const groomerSpecs: { name: string; roles: StaffRole[] }[] = [
    { name: "Rosa Delgado", roles: ["MANAGER", "GROOMER"] },
    { name: "Danny Kim", roles: ["GROOMER"] },
    { name: "Alice Moreau", roles: ["GROOMER", "BATHER"] },
    { name: "Theo Banks", roles: ["BATHER"] },
  ];
  const groomers = [];
  for (const [i, spec] of groomerSpecs.entries()) {
    const email = `${spec.name.split(" ")[0].toLowerCase()}@demo.test`;
    groomers.push(
      await prisma.staff.upsert({
        where: { email },
        update: {},
        create: {
          name: spec.name,
          email,
          passwordHash,
          roles: spec.roles,
          commissionPercent: pick([40, 45, 50]),
          defaultStationId: workStations[i % workStations.length]?.id,
          presence: i < 2 ? "READY" : "OFF_SHIFT",
        },
      })
    );
  }

  // A rota for this week, so /staff/schedule has something on it.
  for (const staff of groomers) {
    for (let d = -2; d <= 4; d++) {
      if (chance(0.15)) continue; // a day off
      await prisma.staffShift.create({
        data: { staffId: staff.id, startsAt: shopTime(d, 8), endsAt: shopTime(d, 17) },
      });
    }
  }

  // ── a legacy rate, so the pricing-tier paths have data ─────────────────────
  const tier = await prisma.pricingTier.upsert({
    where: { name: "Legacy 2015" },
    update: {},
    create: {
      name: "Legacy 2015",
      discountKind: "PERCENT",
      discountPercent: 15,
      note: "Customers from before the 2015 price rise.",
    },
  });

  /**
   * Stand the pet at a station that matches the stage it is at. A pet waiting
   * to be started or waiting for its owner holds no station, same rule the
   * floor board applies on a drop.
   */
  const stationFor = (status: AppointmentStatus) => {
    const role =
      status === "IN_PROGRESS" || status === "FINISHING"
        ? "GROOMER"
        : status === "DRYING"
          ? "DRYING"
          : null;
    if (!role) return null;
    const fit = workStations.filter((s) => s.role === role);
    // A shop with no drying station dries on the groom table.
    return (fit.length > 0 ? pick(fit) : pick(workStations)).id;
  };

  /** Hand out a door to a pet that is in the shop, while doors last. */
  const kennelFor = (status: AppointmentStatus) =>
    (inShop(status) || status === "COMPLETE" || status === "READY_PICKUP") && chance(0.6)
      ? freeKennels.pop()?.id ?? null
      : null;

  // ── customers, pets, visits ────────────────────────────────────────────────
  const CUSTOMERS = Number(process.env.DEMO_CUSTOMERS) || 120;
  let petCount = 0;
  let apptCount = 0;

  for (let c = 0; c < CUSTOMERS; c++) {
    const firstName = FIRST[c % FIRST.length];
    const lastName = LAST[Math.floor(c / FIRST.length) % LAST.length];
    const preferred = chance(0.6) ? pick(groomers) : null;

    const customer = await prisma.customer.create({
      data: {
        firstName,
        lastName,
        email: `${firstName}.${lastName}${c}@demo.test`.toLowerCase(),
        phone: `602-555-${String(1000 + c * 13).slice(0, 4)}`,
        passwordHash,
        address: `${int(100, 9999)} ${pick(STREETS)}, Phoenix, AZ 850${int(10, 45)}`,
        preferredStaffId: preferred?.id,
        pricingTierId: chance(0.15) ? tier.id : null,
        pricingNotes: chance(0.1) ? "Long-time customer — honours the old rate." : null,
        alternateContacts: chance(0.4)
          ? {
              create: pickSome(FIRST, int(1, 2)).map((name) => ({
                name: `${name} ${lastName}`,
                phone: `602-555-${int(1000, 9999)}`,
              })),
            }
          : undefined,
      },
    });

    // The waiver they signed, so the portal does not stop them at the door.
    await prisma.waiverAcceptance.create({
      data: { customerId: customer.id, waiverVersion: config.waiverVersion ?? "1.0" },
    });

    for (let p = 0; p < (chance(0.3) ? 2 : 1); p++) {
      const isCat = chance(0.2);
      const pet = await prisma.pet.create({
        data: {
          customerId: customer.id,
          name: pick(isCat ? CAT_NAMES : DOG_NAMES),
          species: isCat ? "CAT" : "DOG",
          sex: pick(["MALE", "FEMALE"] as const),
          breed: pick(isCat ? CAT_BREEDS : DOG_BREEDS),
          dateOfBirth: shopTime(-int(365, 4380), 12),
          weightLbs: isCat ? int(6, 18) : int(8, 95),
          coatType: pick(["SHORT", "LONG", "CURLY", "DOUBLE", "WIRE"] as const),
          temperamentNotes: pick(TEMPERAMENT),
          groomingNotes: pick(GROOMING_NOTES),
          healthFlags: pick(HEALTH_FLAGS),
          hasBiteHistory: chance(0.06),
        },
      });
      petCount++;

      // Visit history: roughly every 6-10 weeks back through the last nine
      // months, plus bookings on the books ahead. Every pet spans well over 90
      // days, so cadence, rebooking and no-show patterns have something to read.
      const days: number[] = [];
      for (let d = -int(3, 20); d > -270; d -= int(42, 70)) days.push(d);
      if (chance(0.7)) days.push(int(1, 21));
      if (chance(0.35)) days.push(int(22, 60));
      if (c < 40 && p === 0) days.push(0);

      for (const day of days) {
        const pool = isCat ? catServices : dogServices;
        const chosen = [pick(pool.filter((s) => !s.walkInEligible) ?? pool) ?? pick(pool)];
        if (chance(0.4)) chosen.push(pick(addOns));
        const lines = chosen
          .filter((s, i, all) => all.findIndex((x) => x.id === s.id) === i)
          .map((service, i) => ({
            serviceId: service.id,
            serviceType: service.type,
            priceCents:
              service.priceFlatCents ??
              service.priceSmallCents ??
              service.priceMediumCents ??
              null,
            sortOrder: i,
          }));
        const duration = chosen.reduce((sum, s) => sum + (s.durationMins ?? 60), 0);
        const groomer = preferred ?? pick(groomers);
        const status = statusFor(day);
        const kennelId = kennelFor(status);
        const scheduledAt = shopTime(day, int(8, 15), pick([0, 30]));

        const appointment = await prisma.appointment.create({
          data: {
            customerId: customer.id,
            petId: pet.id,
            scheduledAt,
            appointmentType: chance(0.15) ? "WALK_IN" : "APPOINTMENT",
            status,
            serviceType: lines[0].serviceType,
            durationMins: duration,
            needsKennel: chance(0.5),
            staffId: status === "SCHEDULED" ? (chance(0.5) ? groomer.id : null) : groomer.id,
            stationId: stationFor(status),
            checkedInAt: status === "SCHEDULED" ? null : scheduledAt,
            completedAt: finished(status) ? new Date(+scheduledAt + duration * 60_000) : null,
            visitNotes: chance(0.2) ? "Owner called ahead — running late." : null,
            kennelId,
            kenneledAt: kennelId ? scheduledAt : null,
            services: { create: lines },
            statusHistory: { create: historyFor(status, scheduledAt, groomer.id) },
          },
        });
        apptCount++;

        // A punch for every finished visit. Normally syncRewardForVisit() does
        // this from changeAppointmentStatus(); demo rows are written straight in.
        if (finished(status)) {
          await prisma.rewardEarning.create({
            data: {
              customerId: customer.id,
              appointmentId: appointment.id,
              earnedAt: appointment.completedAt ?? scheduledAt,
            },
          });
        }

        if (chance(0.05)) {
          await prisma.visitEvent.create({
            data: {
              appointmentId: appointment.id,
              eventType: pick(["REWASH", "MATTING_FOUND", "INJURY", "BEHAVIORAL", "OTHER"] as const),
              occurredAt: scheduledAt,
              note: "Logged by the groomer during the visit.",
              loggedById: groomer.id,
            },
          });
        }
      }
    }
  }

  // Live offers, so the pricing page and the counter script have something on
  // them. Tied to one service each, as every promotion is.
  const promoted = services.slice(0, 2);
  for (const [i, service] of promoted.entries()) {
    await prisma.promotion.create({
      data: {
        serviceId: service.id,
        title: `${service.name} — $10 off this month`,
        body: `Ten dollars off every ${service.name.toLowerCase()} booked this month.`,
        code: i === 0 ? "FRESH10" : null,
        startsAt: shopTime(-7, 0),
        endsAt: shopTime(21, 0),
        sortOrder: (i + 1) * 10,
      },
    });
  }

  console.log(`✅ ${CUSTOMERS} customers, ${petCount} pets, ${apptCount} appointments, ${groomers.length} staff`);
  console.log(`   Written to "${targetDatabase}". Every demo login is password \`demo1234\`.`);
}

/** Past visits are done, today's are mid-groom, future ones are on the books. */
function statusFor(day: number): AppointmentStatus {
  if (day > 0) return "SCHEDULED";
  if (day === 0) {
    // Weighted towards a busy floor: most of today's pets are already in.
    return pick(["CHECKED_IN", "CHECKED_IN", "IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS",
      "DRYING", "DRYING", "FINISHING", "FINISHING", "COMPLETE", "READY_PICKUP",
      "READY_PICKUP", "PICKED_UP", "SCHEDULED"] as const);
  }
  if (chance(0.06)) return "NO_SHOW";
  if (chance(0.05)) return "CANCELLED";
  return "PICKED_UP";
}

const inShop = (s: AppointmentStatus) =>
  (["CHECKED_IN", "IN_PROGRESS", "DRYING", "FINISHING"] as AppointmentStatus[]).includes(s);
const finished = (s: AppointmentStatus) =>
  (["COMPLETE", "READY_PICKUP", "PICKED_UP"] as AppointmentStatus[]).includes(s);

/** The trail a visit leaves behind: every status it passed through, in order. */
function historyFor(status: AppointmentStatus, start: Date, staffId: string) {
  const FLOW: AppointmentStatus[] = ["SCHEDULED", "CHECKED_IN", "IN_PROGRESS", "DRYING",
    "FINISHING", "COMPLETE", "READY_PICKUP", "PICKED_UP"];
  const upTo = FLOW.indexOf(status);
  const path = upTo >= 0 ? FLOW.slice(0, upTo + 1) : ["SCHEDULED" as AppointmentStatus, status];
  return path.map((s, i) => ({
    status: s,
    changedAt: new Date(+start + i * 20 * 60_000),
    changedById: s === "SCHEDULED" ? null : staffId,
  })) satisfies Prisma.AppointmentStatusHistoryCreateWithoutAppointmentInput[];
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
