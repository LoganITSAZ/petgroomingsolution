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

  it("keeps a quote in the middle of a cell as a quote", () => {
    expect(parseCsv('pet,notes\nMax,6" tall\nBella,ok')).toEqual([["pet", "notes"], ["Max", '6" tall'], ["Bella", "ok"]]);
  });

  it("refuses a quoted cell that never closes, naming its row, rather than swallowing every row after it", () => {
    expect(() => parseCsv('pet,notes\nMax,"Scissors only\nBella,ok\n')).toThrow(/row 2\b/i);
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
      { row: 2, message: 'weight "big" is not a weight in pounds, left blank' },
      { row: 3, message: "milo is listed twice for ann@example.com, kept row 2" },
    ]);
  });

  it("reads any bite answer but a plain no as a bite history, and keeps what it said", () => {
    const result = plan([
      "First,Last,Email,Pet,Bites,Temperament",
      "Ann,Lee,ann@example.com,Milo,2,Shy",
      "Ann,Lee,ann@example.com,Rex,bit groomer,",
      "Ann,Lee,ann@example.com,Bo,No,",
      "Ann,Lee,ann@example.com,Zed,Y,",
    ]);
    expect(result.households[0].pets.map((pet) => [pet.name, pet.hasBiteHistory, pet.temperamentNotes])).toEqual([
      ["Milo", true, "Shy\nBite history: 2"],
      ["Rex", true, "Bite history: bit groomer"],
      ["Bo", false, null],
      ["Zed", true, null],
    ]);
    expect(result.warnings).toEqual([
      { row: 2, message: 'bites "2" read as a bite history, kept in temperament notes' },
      { row: 3, message: 'bites "bit groomer" read as a bite history, kept in temperament notes' },
    ]);
  });

  it("takes a weight only when it is plainly pounds, because the size and the price are read off it", () => {
    const result = plan([
      "First,Last,Email,Pet,Weight",
      "Ann,Lee,ann@example.com,A,25 lbs",
      "Ann,Lee,ann@example.com,B,12.5lb",
      "Ann,Lee,ann@example.com,C,10 kg",
      "Ann,Lee,ann@example.com,D,-5",
      "Ann,Lee,ann@example.com,E,12-15 lbs",
    ]);
    expect(result.households[0].pets.map((pet) => pet.weightLbs)).toEqual([25, 12.5, null, null, null]);
    expect(result.warnings.map((warning) => warning.row)).toEqual([4, 5, 6]);
  });

  it("builds one address line from split columns", () => {
    const result = plan(["First,Last,Email,Street,Apt,City,State,Zip", "Ann,Lee,ann@example.com,123 Main St,Apt 4,Phoenix,AZ,85001"]);
    expect(result.households[0].address).toBe("123 Main St, Apt 4, Phoenix, AZ 85001");
  });

  it("refuses a file with no email or name column rather than skipping every row", () => {
    expect(plan(["Pet,Breed", "Max,Poodle"]).missing).toEqual(["email", "name"]);
  });
});
