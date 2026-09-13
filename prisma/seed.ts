import { PrismaClient, Prisma, StationRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_BUSINESS_HOURS } from "../lib/config";
import {
  DEFAULT_EMAIL_FROM_ADDRESS,
  DEFAULT_SHOP_ADDRESS,
  DEFAULT_SHOP_EMAIL,
  DEFAULT_SHOP_NAME,
  DEFAULT_SHOP_TAGLINE,
  DEFAULT_SHOP_PHONE,
  DEFAULT_SHOP_WEBSITE,
  DEFAULT_ADMIN_EMAIL,
  defaultWaiverText,
} from "../lib/branding";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  const adminEmail = process.env.ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  // System config
  await prisma.systemConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      shopName: DEFAULT_SHOP_NAME,
      shopPhone: DEFAULT_SHOP_PHONE,
      shopTagline: DEFAULT_SHOP_TAGLINE,
      shopAddress: DEFAULT_SHOP_ADDRESS,
      shopWebsite: DEFAULT_SHOP_WEBSITE,
      shopEmail: DEFAULT_SHOP_EMAIL,
      emailFromAddress: DEFAULT_EMAIL_FROM_ADDRESS,
      featureOnlineBooking: true,
      featureWalkInPortal: true,
      featureEmailNotify: true,
      featureSmsNotify: false,
      featureWaiverRequired: true,
      waiverText: defaultWaiverText(DEFAULT_SHOP_NAME),
      waiverVersion: "1.0",
      businessHours: DEFAULT_BUSINESS_HOURS,
      bookingLeadHours: 2,
      bookingWindowDays: 30,
      walkInWindowStart: "09:00",
      walkInWindowEnd: "15:00",
    },
  });
  console.log("✓ SystemConfig");

  // First-boot admin. Once the shop has any staff, this is skipped: the seed
  // runs on every deploy and must never resurrect a removed account or reset
  // a password. Use `npm run staff:password` to reset one.
  //
  // ADMIN_PASSWORD is required rather than defaulted: a built-in initial
  // password is both a credential nobody is told about — which is how a shop
  // ends up locked out of its own first account — and one the whole internet
  // knows for any deploy that never changed it.
  const staffCount = await prisma.staff.count();
  if (staffCount === 0) {
    if (!adminPassword || adminPassword.length < 8) {
      throw new Error(
        "No staff accounts exist and ADMIN_PASSWORD is not set (min 8 characters).\n" +
          `Set ADMIN_EMAIL and ADMIN_PASSWORD in .env, then re-run the seed. ADMIN_EMAIL defaults to ${DEFAULT_ADMIN_EMAIL}.`
      );
    }
    const admin = await prisma.staff.create({
      data: {
        name: "Admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        roles: ["ADMIN"],
      },
    });
    console.log(`✓ Staff — created ${admin.email} (change the initial password now)`);
  } else {
    // Name the admins rather than counting them: the seed runs on every deploy
    // and this line is where an operator finds out what to sign in as.
    const admins = await prisma.staff.findMany({
      where: { roles: { has: "ADMIN" }, isActive: true },
      select: { email: true },
      orderBy: { createdAt: "asc" },
    });
    console.log(
      `✓ Staff — ${staffCount} account(s) already exist, skipped. Admins: ${
        admins.map((a) => a.email).join(", ") || "none active — run npm run staff:password"
      }`
    );
  }

  // Stations. Role decides how a station is used on the floor; kennel units
  // are stations too, with a rows x columns layout instead of a single spot.
  const stations: { name: string; role: StationRole }[] = [
    { name: "Station 1", role: "GROOMER" },
    { name: "Station 2", role: "GROOMER" },
    { name: "Station 3", role: "GROOMER" },
    { name: "Bath Area", role: "BATHING" },
  ];
  for (const { name, role } of stations) {
    await prisma.station.upsert({
      where: { id: name.toLowerCase().replace(/ /g, "-") },
      update: { role },
      create: {
        id: name.toLowerCase().replace(/ /g, "-"),
        name,
        role,
        isActive: true,
      },
    });
  }
  console.log(`✓ ${stations.length} stations`);

  // Service catalog — the prices the shop publishes. Dog services are priced by
  // size; cats and add-ons use a flat price, with priceMaxCents when the shop
  // quotes a range.
  const services: Prisma.ServiceCreateInput[] = [
    {
      type: "BATH_AND_TIDY", category: "BATH", name: "Bath + Tidy", species: "DOG", sortOrder: 10,
      description: "Bath, blow-dry, brush out and a tidy trim.",
      priceSmallCents: 4500, priceMediumCents: 6000, priceLargeCents: 8500, priceXlCents: 12000,
      durationMins: 60,
    },
    {
      type: "BATH_AND_TRIM", category: "BATH", name: "Bath + Trim", species: "DOG", sortOrder: 20,
      description: "Everything in Bath + Tidy plus a full trim.",
      priceSmallCents: 5500, priceMediumCents: 7500, priceLargeCents: 10000, priceXlCents: 14500,
      durationMins: 90,
    },
    {
      type: "FULL_GROOM", category: "GROOM", name: "Full Groom", species: "DOG", sortOrder: 30,
      description: "Full cut and style with a bath.",
      priceSmallCents: 7500, priceMediumCents: 10000, priceLargeCents: 14000, priceXlCents: 19000,
      durationMins: 120,
    },
    {
      type: "NAIL_TRIM", category: "NAILS", name: "Nail Trim", species: "DOG", sortOrder: 40,
      priceSmallCents: 1700, priceMediumCents: 2000, priceLargeCents: 2500, priceXlCents: 3000,
      durationMins: 15, walkInEligible: true,
    },
    {
      type: "NAIL_GRIND", category: "NAILS", name: "Nail Grind", species: "DOG", sortOrder: 50,
      description: "Nails ground smooth after trimming.",
      priceSmallCents: 2000, priceMediumCents: 2500, priceLargeCents: 3000, priceXlCents: 3500,
      durationMins: 20, walkInEligible: true,
    },
    {
      type: "TEETH_BRUSHING", category: "DENTAL", name: "Teeth Brushing", sortOrder: 60,
      priceFlatCents: 1500, durationMins: 10, walkInEligible: true,
    },
    {
      type: "EAR_CLEANING", category: "EARS", name: "Ear Cleaning", sortOrder: 70,
      priceFlatCents: 1500, durationMins: 10, walkInEligible: true,
    },
    {
      type: "GLAND_EXPRESSION", category: "ADD_ON", name: "Gland Expression", sortOrder: 80,
      priceFlatCents: 2000, durationMins: 10, walkInEligible: true,
    },
    {
      type: "BATH_AND_TIDY", category: "BATH", name: "Bath / Comb / Nails", species: "CAT", sortOrder: 110,
      description: "Bath, comb out and nail trim for cats.",
      priceFlatCents: 5500, priceMaxCents: 7000, durationMins: 60,
    },
    {
      type: "FULL_GROOM", category: "GROOM", name: "Cat Haircut", species: "CAT", sortOrder: 120,
      priceFlatCents: 9500, priceMaxCents: 13000, durationMins: 90,
    },
    {
      type: "LION_CUT", category: "GROOM", name: "Lion Cut", species: "CAT", sortOrder: 130,
      description: "Shaved body with fluffy head, paws and tail.",
      priceFlatCents: 8500, priceMaxCents: 11000, durationMins: 90,
    },
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: { name: service.name },
      update: {},
      create: service,
    });
  }
  console.log(`✓ ${services.length} catalog services`);

  // Published surcharges
  const surcharges = [
    { label: "Matted coat", minCents: 1500, maxCents: 5500, sortOrder: 10 },
    { label: "Difficult or aggressive handling", minCents: 1500, maxCents: 5500, sortOrder: 20 },
    { label: "Late pickup (after close)", minCents: 2500, sortOrder: 30 },
  ];
  for (const surcharge of surcharges) {
    const existing = await prisma.surcharge.findFirst({ where: { label: surcharge.label } });
    if (!existing) await prisma.surcharge.create({ data: surcharge });
  }
  console.log(`✓ ${surcharges.length} surcharges`);

  // Breed reference for the station job aid. These are widely documented coat
  // characteristics, not shop policy — staff edit them from the admin panel as
  // they learn what each breed actually takes here.
  const breedGuides = [
    {
      breed: "Poodle",
      coat: "CURLY" as const,
      summary: "Dense curly coat that keeps growing and mats close to the skin.",
      tips: [
        "Brush and comb to the skin before bathing — bathing a matted coat tightens it",
        "Check behind ears, armpits and the tail base first, where mats start",
        "Clipper work needs a clean, dry, brushed-out coat to avoid tracking",
      ].join("\n"),
      typicalMins: 120,
    },
    {
      breed: "Goldendoodle",
      coat: "CURLY" as const,
      summary: "Coat varies from wavy to tight curl; often matted between grooms.",
      tips: [
        "Coat type varies pet to pet — check the density before quoting time",
        "Ask the owner about brushing at home; mats mean a shorter length",
        "Legs and the beard hold moisture and knot fastest",
      ].join("\n"),
      typicalMins: 150,
    },
    {
      breed: "Golden Retriever",
      coat: "DOUBLE" as const,
      summary: "Heavy double coat that sheds seasonally. Never shaved.",
      tips: [
        "Deshed and blow out the undercoat rather than clipping the topcoat",
        "Feathering on legs, tail and britches needs tidying, not removing",
        "Allow drying time — the undercoat holds a lot of water",
      ].join("\n"),
      typicalMins: 120,
    },
    {
      breed: "German Shepherd",
      coat: "DOUBLE" as const,
      summary: "Dense double coat with heavy seasonal shedding.",
      tips: [
        "Undercoat rake plus a high-velocity dry does most of the work",
        "Do not clip the coat — it protects against both heat and sun",
        "Expect a long dry; damp undercoat causes hot spots",
      ].join("\n"),
      typicalMins: 100,
    },
    {
      breed: "Shih Tzu",
      coat: "LONG" as const,
      summary: "Continuously growing single coat; face and eyes need care.",
      tips: [
        "Trim around the eyes carefully and keep the airway clear",
        "Ears grow hair inside — check and clean at every visit",
        "Face, feet and sanitary tidy matter more than length to most owners",
      ].join("\n"),
      typicalMins: 90,
    },
    {
      breed: "Yorkshire Terrier",
      coat: "LONG" as const,
      summary: "Fine, silky, fast-growing coat that tangles easily.",
      tips: [
        "Fine coat snags — comb through before and after the bath",
        "Small dog, thin skin: watch clipper heat around the belly and armpits",
        "Confirm face length with the owner before starting",
      ].join("\n"),
      typicalMins: 75,
    },
    {
      breed: "Labrador Retriever",
      coat: "SHORT" as const,
      summary: "Short dense double coat; sheds heavily, little cutting needed.",
      tips: [
        "Deshedding bath and blow out is the bulk of the groom",
        "Check ears — a common trouble spot for this breed",
        "Nails are often thick and need a grinder to finish",
      ].join("\n"),
      typicalMins: 60,
    },
    {
      breed: "Australian Shepherd",
      coat: "DOUBLE" as const,
      summary: "Medium double coat with feathering; mats behind ears and legs.",
      tips: [
        "Line brush the britches and behind the ears",
        "Tidy feet and hocks; keep the natural outline",
        "Do not shave — the coat regrows unevenly",
      ].join("\n"),
      typicalMins: 100,
    },
    {
      breed: "Schnauzer",
      coat: "WIRE" as const,
      summary: "Wiry topcoat with soft undercoat; classic pattern clip.",
      tips: [
        "Beard and leg furnishings need combing before and after bathing",
        "Keep the pattern: short body, longer furnishings and eyebrows",
        "Clipped coats soften over time — mention hand-stripping if the owner wants texture",
      ].join("\n"),
      typicalMins: 100,
    },
    {
      breed: "Maltese",
      coat: "LONG" as const,
      summary: "Single, silky white coat; tear staining is common.",
      tips: [
        "Work through tangles dry, then bathe",
        "Clean the eye area and check for staining",
        "White coat shows every miss — rinse thoroughly",
      ].join("\n"),
      typicalMins: 90,
    },
    {
      breed: "Persian",
      species: "CAT" as const,
      coat: "LONG" as const,
      summary: "Long dense cat coat that mats quickly, especially the belly.",
      tips: [
        "Check the belly and armpits first — mats hide there",
        "Work quietly and keep the session short; stop if stress builds",
        "Sanitary trim matters for this breed at every visit",
      ].join("\n"),
      typicalMins: 90,
    },
    {
      breed: "Domestic Shorthair",
      species: "CAT" as const,
      coat: "SHORT" as const,
      summary: "Short cat coat; usually a bath, nails and ears.",
      tips: [
        "Nails first, while the cat is calmest",
        "Keep water off the face; use a cloth instead",
        "Watch for stress signals and stop early rather than pushing on",
      ].join("\n"),
      typicalMins: 45,
    },
  ];

  for (const guide of breedGuides) {
    await prisma.breedGuide.upsert({
      where: { breed: guide.breed },
      update: {},
      create: guide,
    });
  }
  console.log(`✓ ${breedGuides.length} breed guides`);

  console.log("\n✅ Seed complete.");
  if (staffCount === 0) {
    console.log(`   Admin login: ${adminEmail}`);
    console.log("   ⚠  Change the admin password immediately after first login!");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
