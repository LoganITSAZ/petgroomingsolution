import { z } from "zod";
import type { PetSex, Species } from "@prisma/client";

/**
 * Bringing a shop's existing client list across, as pure arithmetic: bytes to
 * rows, rows to households. scripts/import-customers.ts is the half that
 * touches the database.
 *
 * A household is keyed by its email, because every customer needs one and it
 * is unique. Most grooming software exports a row per pet with the owner
 * repeated on each, and those rows are one customer with several pets.
 */

/*
 * Header spellings, compared with case, spaces and punctuation stripped, so
 * "E-mail Address" is `emailaddress`. Order inside a list is preference: the
 * first match wins and claims its column.
 */
const ALIASES = {
  firstName: ["firstname", "first", "ownerfirstname", "clientfirstname", "customerfirstname", "givenname"],
  lastName: ["lastname", "last", "surname", "ownerlastname", "clientlastname", "customerlastname", "familyname"],
  fullName: ["name", "fullname", "owner", "ownername", "client", "clientname", "customer", "customername"],
  email: ["email", "emailaddress", "email1", "primaryemail", "owneremail", "clientemail", "customeremail"],
  // A mobile first: it is the number that can take a text.
  phone: ["mobile", "mobilephone", "cell", "cellphone", "phone", "phonenumber", "phone1", "primaryphone", "telephone", "homephone", "ownerphone", "clientphone"],
  address: ["address", "streetaddress", "street", "address1", "addressline1", "mailingaddress"],
  address2: ["address2", "addressline2", "apt", "unit", "suite"],
  city: ["city", "town"],
  state: ["state", "province"],
  zip: ["zip", "zipcode", "postalcode", "postcode"],
  petName: ["pet", "petname", "dog", "dogname", "animal", "animalname"],
  species: ["species", "animaltype", "pettype"],
  breed: ["breed", "petbreed", "dogbreed"],
  weight: ["weight", "weightlbs", "lbs", "pounds", "petweight"],
  sex: ["sex", "gender"],
  groomingNotes: ["notes", "groomingnotes", "groomnotes", "petnotes", "instructions", "haircut", "style"],
  temperament: ["temperament", "behavior", "behaviour", "temperamentnotes"],
  health: ["health", "healthnotes", "medical", "medicalnotes", "conditions", "allergies", "alerts"],
  vetName: ["vet", "vetname", "veterinarian", "vetclinic"],
  vetPhone: ["vetphone", "veterinarianphone"],
  biteHistory: ["bites", "bite", "bitehistory"],
} as const;

export type ImportField = keyof typeof ALIASES;

export type ImportPet = {
  name: string;
  species: Species;
  sex: PetSex;
  breed: string | null;
  weightLbs: number | null;
  groomingNotes: string | null;
  temperamentNotes: string | null;
  healthFlags: string[];
  vetName: string | null;
  vetPhone: string | null;
  hasBiteHistory: boolean;
};

export type ImportHousehold = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  pets: ImportPet[];
  /** Spreadsheet row numbers, the header being row 1. */
  rows: number[];
};

export type ImportIssue = { row: number; message: string };

/**
 * UTF-8, or the Windows encoding when the bytes are not valid UTF-8 — Excel's
 * plain "CSV" still writes that, and reading it as UTF-8 turns José into
 * Jos� on every customer the shop has.
 */
export function decodeCsv(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

/**
 * RFC 4180: quoted fields may hold commas, line breaks and doubled quotes.
 * Blank lines come back as records so row numbers match the spreadsheet.
 *
 * A quote opens a field only at its start; one later in a cell (`6" tall`) is
 * just a character. A quoted field still open at the end of the file throws:
 * read leniently, it would swallow every row after it into one cell, and
 * those customers would vanish without being reported as skipped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quotedFrom = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (char === '"' && field === "") {
      quoted = true;
      quotedFrom = rows.length + 1;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) {
    throw new Error(
      `Row ${quotedFrom} opens a quoted cell that never closes, so every row after it would run into that cell. Fix that row in the spreadsheet and save it again.`
    );
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const normalise = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

export function mapColumns(header: string[]): { columns: Partial<Record<ImportField, number>>; ignored: string[] } {
  const keys = header.map(normalise);
  const used = new Set<number>();
  const columns: Partial<Record<ImportField, number>> = {};
  for (const field of Object.keys(ALIASES) as ImportField[]) {
    // A whole-name column is only needed when the names are not split already;
    // claiming it anyway would hide a pet-name "Name" column from the report.
    if (field === "fullName" && columns.firstName !== undefined && columns.lastName !== undefined) continue;
    for (const alias of ALIASES[field]) {
      const index = keys.findIndex((key, i) => key === alias && !used.has(i));
      if (index >= 0) {
        columns[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return { columns, ignored: header.filter((name, i) => !used.has(i) && name.trim()) };
}

const EMAIL = z.string().email();

export function planImport(rows: string[][]) {
  const [header = [], ...body] = rows;
  const { columns, ignored } = mapColumns(header);
  const hasNames = columns.fullName !== undefined || (columns.firstName !== undefined && columns.lastName !== undefined);
  const missing = [...(columns.email === undefined ? ["email"] : []), ...(hasNames ? [] : ["name"])];

  const households = new Map<string, ImportHousehold>();
  const petRows = new Map<string, number>();
  const skipped: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];

  if (missing.length === 0) {
    body.forEach((cells, index) => {
      const row = index + 2;
      if (cells.every((cell) => !cell.trim())) return;
      const cell = (field: ImportField) => {
        const at = columns[field];
        return at === undefined ? "" : (cells[at] ?? "").trim();
      };

      const { firstName, lastName } = splitName(cell("firstName"), cell("lastName"), cell("fullName"));
      const email = cell("email").toLowerCase();
      const who = [firstName, lastName].filter(Boolean).join(" ") || cell("petName");
      if (!email) {
        skipped.push({ row, message: `no email${who ? ` (${who})` : ""}` });
        return;
      }
      if (!EMAIL.safeParse(email).success) {
        skipped.push({ row, message: `"${email}" is not an email address` });
        return;
      }

      let household = households.get(email);
      if (!household) {
        if (!firstName || !lastName) {
          skipped.push({ row, message: "needs a first and a last name" });
          return;
        }
        household = { email, firstName, lastName, phone: null, address: null, pets: [], rows: [] };
        households.set(email, household);
      }
      household.rows.push(row);
      // The first row to give a detail wins; a later blank never erases it.
      household.phone ??= cell("phone") || null;
      household.address ??= joinAddress(cell) || null;

      const name = cell("petName");
      if (!name) return;
      const key = `${email}\n${name.toLowerCase()}`;
      const first = petRows.get(key);
      if (first) {
        warnings.push({ row, message: `${name} is listed twice for ${email}, kept row ${first}` });
        return;
      }
      petRows.set(key, row);
      household.pets.push(readPet(name, cell, (message) => warnings.push({ row, message })));
    });
  }

  return { header, columns, ignored, missing, households: [...households.values()], skipped, warnings };
}

function splitName(first: string, last: string, full: string) {
  if ((first && last) || !full) return { firstName: first, lastName: last };
  // "Smith, Jane" is how a list sorted by surname writes it.
  const comma = full.indexOf(",");
  if (comma >= 0) return { firstName: full.slice(comma + 1).trim(), lastName: full.slice(0, comma).trim() };
  const space = full.lastIndexOf(" ");
  if (space < 0) return { firstName: full, lastName: "" };
  return { firstName: full.slice(0, space).trim(), lastName: full.slice(space + 1).trim() };
}

/** "123 Main St, Apt 4, Phoenix, AZ 85001" — the one free-text line the app keeps. */
function joinAddress(cell: (field: ImportField) => string): string {
  const region = [cell("state"), cell("zip")].filter(Boolean).join(" ");
  return [cell("address"), cell("address2"), cell("city"), region].filter(Boolean).join(", ");
}

function readPet(name: string, cell: (field: ImportField) => string, warn: (message: string) => void): ImportPet {
  // Plainly pounds or nothing: the size tier and the price are read off this
  // number, so "10 kg", "-5" or "12-15" is left for the shop to check rather
  // than stored as a measurement it never was.
  const weightText = cell("weight");
  const pounds = /^(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?|#)?\.?$/i.exec(weightText);
  const weightLbs = pounds && Number(pounds[1]) > 0 ? Number(pounds[1]) : null;
  if (weightText && weightLbs === null) warn(`weight "${weightText}" is not a weight in pounds, left blank`);

  // Anything but a plain no is a bite history. A banner on a dog that never
  // bit costs a glance; the opposite mistake costs a groomer a bite. What the
  // old system said beyond a bare yes is kept where the station shows it.
  const biteText = cell("biteHistory");
  const hasBiteHistory = Boolean(biteText) && !/^(n|no|none|never|false|0|-+)$/i.test(biteText);
  const biteNote = hasBiteHistory && !/^(y|yes|true|x|1)$/i.test(biteText) ? `Bite history: ${biteText}` : null;
  if (biteNote) warn(`bites "${biteText}" read as a bite history, kept in temperament notes`);

  return {
    name,
    species: readSpecies(cell("species")),
    sex: readSex(cell("sex")),
    breed: cell("breed") || null,
    weightLbs,
    groomingNotes: cell("groomingNotes") || null,
    temperamentNotes: [cell("temperament"), biteNote].filter(Boolean).join("\n") || null,
    healthFlags: cell("health").split(/[;\n]/).map((flag) => flag.trim()).filter(Boolean),
    vetName: cell("vetName") || null,
    vetPhone: cell("vetPhone") || null,
    hasBiteHistory,
  };
}

function readSpecies(text: string): Species {
  if (/\b(cat|feline|kitten)\b/i.test(text)) return "CAT";
  // Blank is a dog, the same default as the counter's form.
  if (!text || /\b(dog|canine|k9|puppy)\b/i.test(text)) return "DOG";
  return "OTHER";
}

/** "F/S", "Spayed Female", "MN", "Neutered Male" — the shorthand exports use. */
function readSex(text: string): PetSex {
  const value = text.toLowerCase().replace(/[^a-z]/g, "");
  if (value.includes("female") || value.includes("spay") || ["f", "fs", "sf"].includes(value)) return "FEMALE";
  if (value.includes("male") || value.includes("neuter") || ["m", "mn", "nm"].includes(value)) return "MALE";
  return "UNKNOWN";
}
