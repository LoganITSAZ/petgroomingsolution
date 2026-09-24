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
      businessHours: DEFAULT_BUSINESS_HOURS,
      bookingLeadHours: 2,
      bookingWindowDays: 30,
      walkInWindowStart: "09:00",
      walkInWindowEnd: "15:00",
    },
  });
  console.log("✓ SystemConfig");

  // The one document every shop signs people on. First boot only: the body is
  // the shop's own copy once it has edited it, and the seed runs every deploy.
  const documentCount = await prisma.shopDocument.count();
  if (documentCount === 0) {
    await prisma.shopDocument.create({
      data: {
        id: "doc_waiver",
        kind: "WAIVER",
        title: "Liability Waiver",
        body: defaultWaiverText(DEFAULT_SHOP_NAME),
        version: "1.0",
        sortOrder: 0,
      },
    });
    console.log("✓ ShopDocument — liability waiver");
  } else {
    console.log(`✓ Documents — ${documentCount} already exist, skipped`);
  }

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
  // Names follow the shop's own rule — role plus the next free number, the
  // same strings `nextStationName()` hands out, since nobody types one.
  //
  // First boot only, same rule as the admin above: once the shop has any
  // station the seed leaves them alone. It used to upsert on an id derived
  // from the name, which stopped matching the moment
  // `20260913120000_station_names_derived` renamed "Station 1" to
  // "Grooming Table 1" — the old row keeps id `station-1`, the lookup misses
  // and every deploy adds a fresh duplicate floor.
  const stations: { name: string; role: StationRole }[] = [
    { name: "Grooming Table 1", role: "GROOMER" },
    { name: "Grooming Table 2", role: "GROOMER" },
    { name: "Grooming Table 3", role: "GROOMER" },
    { name: "Bath 1", role: "BATHING" },
  ];
  const stationCount = await prisma.station.count();
  if (stationCount === 0) {
    await prisma.station.createMany({
      data: stations.map(({ name, role }) => ({ name, role, isActive: true })),
    });
    console.log(`✓ ${stations.length} stations`);
  } else {
    console.log(`✓ Stations — ${stationCount} already exist, skipped`);
  }

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
    // Charged on the next visit, not taken up front: the shop holds no cards.
    // `MISSED_APPOINTMENT_LABEL` in lib/no-show.ts matches this label; a shop
    // that does not charge one deactivates the row.
    { label: "Missed appointment", minCents: 2500, note: "Added to the next visit after a no-show.", sortOrder: 40 },
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Full_attention_%288067543690%29.jpg/960px-Full_attention_%288067543690%29.jpg",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Golden_Doodle_Standing_%28HD%29.jpg/960px-Golden_Doodle_Standing_%28HD%29.jpg",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/b/bd/Golden_Retriever_Dukedestiny01_drvd.jpg",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/d/d0/German_Shepherd_-_DSC_0346_%2810096362833%29.jpg",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/d/df/Shihtzu_%28cropped%29.jpg",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/4/41/%282_version%29_Grupp_3%2C_YORKSHIRETERRIER%2C_NO_UCH_SE_UCH_Oxzar_Amazing_Bel%E2%80%99s_Toffy_%2824310212305%29.jpg",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Labrador_on_Quantock_%282175262184%29.jpg/960px-Labrador_on_Quantock_%282175262184%29.jpg",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Australian_Shepherd_red_bi.JPG/960px-Australian_Shepherd_red_bi.JPG",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Standard_Grey_Schnauzer_%28cropped%29.JPG/960px-Standard_Grey_Schnauzer_%28cropped%29.JPG",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/9/94/Maltese_600.jpg",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/8/81/Persialainen.jpg",
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
      photoUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Cat_November_2010-1a.jpg/960px-Cat_November_2010-1a.jpg",
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
      // The guide text is the shop's once it exists; the stock photo is ours to
      // fill in, so a shop that seeded before this column existed still gets one.
      update: { photoUrl: guide.photoUrl },
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
