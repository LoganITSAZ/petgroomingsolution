import { describe, expect, it } from "vitest";
import { decodeCsv, mapColumns, parseCsv, planImport } from "./customer-import";

const plan = (lines: string[]) => planImport(parseCsv(lines.join("\n")));

describe("parseCsv", () => {
  it("reads quoted commas, doubled quotes, line breaks inside quotes and CRLF", () => {
    expect(parseCsv('name,notes\r\n"Smith, Jane","Says ""hi""\nto all"\r\nBob,\r\n')).toEqual([
      ["name", "notes"],
      ["Smith, Jane", 'Says "hi"\nto all'],
      ["Bob", ""],
    ]);
  });
});

describe("decodeCsv", () => {
  it("drops a UTF-8 byte-order mark", () => {
    expect(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x2c, 0x62]))).toBe("a,b");
  });

  it("reads a spreadsheet saved in the Windows encoding without garbling accents", () => {
    // "José" as Excel's plain CSV writes it: the é is the single byte 0xE9.
    expect(decodeCsv(new Uint8Array([0x4a, 0x6f, 0x73, 0xe9]))).toBe("José");
  });
});

describe("mapColumns", () => {
  it("matches headers however the old system spelled them, and prefers a mobile", () => {
    const { columns, ignored } = mapColumns([
      "First Name", "LAST NAME", "E-mail Address", "Home Phone", "Cell Phone", "Pet Name", "Weight (lbs)", "Balance Due",
    ]);
    expect(columns).toMatchObject({ firstName: 0, lastName: 1, email: 2, phone: 4, petName: 5, weight: 6 });
    expect(ignored).toEqual(["Home Phone", "Balance Due"]);
  });

  it("leaves a bare Name column alone when first and last names have their own", () => {
    const { columns, ignored } = mapColumns(["First", "Last", "Email", "Name"]);
    expect(columns.fullName).toBeUndefined();
    expect(ignored).toEqual(["Name"]);
  });
});

describe("planImport", () => {
  it("makes one household per email, with a pet per row", () => {
    const result = plan([
      "Owner,Email,Phone,Pet,Breed,Weight",
      '"Smith, Jane",Jane@Example.com,(602) 555-0101,Max,Poodle,25 lbs',
      "Jane Smith,jane@example.com,,Bella,Shih Tzu,12",
    ]);
    expect(result.missing).toEqual([]);
    expect(result.households).toHaveLength(1);
    expect(result.households[0]).toMatchObject({
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Smith",
      phone: "(602) 555-0101",
      rows: [2, 3],
    });
    expect(result.households[0].pets.map((pet) => [pet.name, pet.breed, pet.weightLbs])).toEqual([
      ["Max", "Poodle", 25],
      ["Bella", "Shih Tzu", 12],
    ]);
  });

  it("names the spreadsheet row of everything it skips", () => {
    const result = plan([
      "Name,Email,Pet",
      "Jane Smith,,Max",
      "Bob Jones,bob@,Rex",
      "Cher,cher@example.com,Sonny",
      "",
      "Ann Lee,ann@example.com,Milo",
    ]);
    expect(result.skipped).toEqual([
      { row: 2, message: "no email (Jane Smith)" },
      { row: 3, message: '"bob@" is not an email address' },
      { row: 4, message: "needs a first and a last name" },
    ]);
    expect(result.households.map((household) => [household.email, household.rows])).toEqual([["ann@example.com", [6]]]);
  });

  it("reads what the counter needs to know about a pet, and warns rather than guessing", () => {
    const result = plan([
      "First,Last,Email,Pet,Species,Sex,Weight,Bites,Medical,Notes",
      "Ann,Lee,ann@example.com,Milo,Cat,F/S,big,yes,seizures; heart murmur,No dryer",
      "Ann,Lee,ann@example.com,milo,Dog,M,10,,,",
    ]);
    expect(result.households[0].pets).toEqual([
      {
        name: "Milo",
        species: "CAT",
        sex: "FEMALE",
        breed: null,
        weightLbs: null,
        groomingNotes: "No dryer",
        temperamentNotes: null,
        healthFlags: ["seizures", "heart murmur"],
        vetName: null,
        vetPhone: null,
        hasBiteHistory: true,
      },
    ]);
    expect(result.warnings).toEqual([
      { row: 2, message: 'weight "big" could not be read, left blank' },
      { row: 3, message: "milo is listed twice for ann@example.com, kept row 2" },
    ]);
  });

  it("builds one address line from split columns", () => {
    const result = plan(["First,Last,Email,Street,Apt,City,State,Zip", "Ann,Lee,ann@example.com,123 Main St,Apt 4,Phoenix,AZ,85001"]);
    expect(result.households[0].address).toBe("123 Main St, Apt 4, Phoenix, AZ 85001");
  });

  it("refuses a file with no email or name column rather than skipping every row", () => {
    expect(plan(["Pet,Breed", "Max,Poodle"]).missing).toEqual(["email", "name"]);
  });
});
