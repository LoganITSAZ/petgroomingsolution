import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_BUSINESS_HOURS, DEFAULT_WAIVER_TEXT } from "../lib/config";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  // System config
  await prisma.systemConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      shopName: "Gentle Groomer",
      shopPhone: "(602) 422-3438",
      shopAddress: "8911 N Central Ave #104, Phoenix, AZ 85020",
      shopWebsite: "https://gentlegroomer.net",
      shopEmail: "info@gentlegroomer.net",
      emailFromName: "Gentle Groomer",
      emailFromAddress: "no-reply@gentlegroomer.net",
      featureOnlineBooking: true,
      featureWalkInPortal: true,
      featureEmailNotify: true,
      featureSmsNotify: false,
      featureWaiverRequired: true,
      waiverText: DEFAULT_WAIVER_TEXT,
      waiverVersion: "1.0",
      businessHours: DEFAULT_BUSINESS_HOURS,
      bookingLeadHours: 2,
      bookingWindowDays: 30,
      walkInWindowStart: "09:00",
      walkInWindowEnd: "15:00",
    },
  });
  console.log("✓ SystemConfig");

  // Admin staff account
  const adminHash = await bcrypt.hash("changeme123", 12);
  const admin = await prisma.staff.upsert({
    where: { email: "admin@gentlegroomer.net" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@gentlegroomer.net",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });
  console.log(`✓ Staff — ${admin.email}`);

  // Grooming stations
  const stations = ["Station 1", "Station 2", "Station 3", "Bath Area"];
  for (const name of stations) {
    await prisma.station.upsert({
      where: { id: name.toLowerCase().replace(/ /g, "-") },
      update: {},
      create: {
        id: name.toLowerCase().replace(/ /g, "-"),
        name,
        displayLabel: name,
        isActive: true,
      },
    });
  }
  console.log(`✓ ${stations.length} stations`);

  console.log("\n✅ Seed complete.");
  console.log("   Admin login: admin@gentlegroomer.net / changeme123");
  console.log("   ⚠  Change the admin password immediately after first login!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
