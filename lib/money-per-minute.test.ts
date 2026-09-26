import { describe, expect, it } from "vitest";
import {
  breedGroup,
  clearsGap,
  moneyPerHour,
  priceInsights,
  rateCents,
  suggestedExtraCents,
  type PricedLine,
  type PricedVisit,
} from "./money-per-minute";

const line = (over: Partial<PricedLine> = {}): PricedLine => ({
  serviceId: "groom",
  serviceName: "Full groom",
  sizeTier: "LARGE",
  sizePriced: true,
  priceCents: 8000,
  ...over,
});

const visit = (dollars: number, mins: number, over: Partial<PricedVisit> = {}): PricedVisit => ({
  workedMins: mins,
  ticketCents: dollars * 100,
  lines: [line()],
  breedKey: null,
  breedLabel: null,
  ...over,
});

const times = (count: number, make: () => PricedVisit) => Array.from({ length: count }, make);

describe("rateCents", () => {
  it("is total ticket over total hours, in whole dollars", () => {
    expect(rateCents([visit(60, 60), visit(30, 60)])).toBe(4500);
    // $120 in 130 minutes, not the average of $45/hr and $180/hr.
    expect(rateCents([visit(90, 120), visit(30, 10)])).toBe(5500);
  });

  it("is null with nothing measured", () => {
    expect(rateCents([])).toBeNull();
  });
});

describe("clearsGap", () => {
  it("needs both the share and the dollars", () => {
    expect(clearsGap(2400, 3000)).toBe(false); // 20% but $6/hr
    expect(clearsGap(10800, 12000)).toBe(false); // $12/hr but 10%
    expect(clearsGap(4800, 6000)).toBe(true); // 20% and $12/hr
  });
});

describe("suggestedExtraCents", () => {
  it("rounds the missing money to the $5 step", () => {
    // $71/hr for 140 min is $165.67; a typical $120 is $45.67 short.
    expect(suggestedExtraCents(7100, 140, 12000)).toBe(4500);
  });

  it("suggests nothing when the gap rounds to nothing or less", () => {
    expect(suggestedExtraCents(6000, 60, 5900)).toBeNull();
    expect(suggestedExtraCents(6000, 60, 7000)).toBeNull();
  });
});

describe("breedGroup", () => {
  it("folds case and spacing in what was typed", () => {
    expect(breedGroup(" Golden  Doodle ", null)).toEqual({ key: "golden doodle", label: "Golden Doodle" });
  });

  it("prefers the shop's own guide", () => {
    expect(breedGroup("Toy Poodle", "Poodle")).toEqual({ key: "poodle", label: "Poodle" });
  });

  it("is nothing without a breed", () => {
    expect(breedGroup(null, null)).toBeNull();
    expect(breedGroup("   ", null)).toBeNull();
  });
});

describe("moneyPerHour", () => {
  it("counts a visit with add-ons toward the shop rate only", () => {
    const addOn = visit(200, 60, { lines: [line(), line({ serviceId: "teeth", serviceName: "Teeth" })] });
    const summary = moneyPerHour([...times(5, () => visit(60, 60)), addOn], 90);
    expect(summary.shopVisits).toBe(6);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].visits).toBe(5);
  });

  it("gives a flat service one row whatever the size says", () => {
    const nails = line({ serviceId: "nails", serviceName: "Nails", sizePriced: false, sizeTier: "XL" });
    const [row] = moneyPerHour(times(5, () => visit(20, 15, { lines: [nails] })), 90).rows;
    expect(row).toMatchObject({ key: "nails:ANY", label: "Nails", size: null });
  });

  it("leaves an unknown size and a deleted service out of the rows", () => {
    const summary = moneyPerHour(
      [
        visit(60, 60, { lines: [line({ sizeTier: null })] }),
        visit(60, 60, { lines: [line({ serviceId: null, serviceName: null, sizePriced: false })] }),
      ],
      90
    );
    expect(summary.shopVisits).toBe(2);
    expect(summary.rows).toHaveLength(0);
  });

  it("leaves out a visit with an unpriced line", () => {
    expect(moneyPerHour([visit(0, 60, { lines: [line({ priceCents: null })] })], 90).shopVisits).toBe(0);
  });

  it("leaves out a visit with no hands-on minutes", () => {
    const summary = moneyPerHour([visit(60, 0)], 90);
    expect(summary.shopVisits).toBe(0);
    expect(summary.shopRateCents).toBeNull();
  });

  it("claims no rate below five visits", () => {
    const [row] = moneyPerHour(times(4, () => visit(60, 60)), 90).rows;
    expect(row.rateCents).toBeNull();
    expect(row.evidence).toBe("4 measured, 5 needed");
  });
});

describe("priceInsights", () => {
  it("measures a row against the shop rate and suggests the price", () => {
    const xl = line({ sizeTier: "XL" });
    const bath = line({ serviceId: "bath", serviceName: "Bath", sizeTier: "SMALL" });
    const summary = moneyPerHour(
      [...times(5, () => visit(52, 60, { lines: [xl] })), ...times(5, () => visit(80, 60, { lines: [bath] }))],
      90
    );
    expect(summary.shopRateCents).toBe(6600);
    const insights = priceInsights(summary);
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      id: "price-rate:groom:XL",
      tone: "opportunity",
      title: "Full groom, XL earns $52/hr against the shop's $66/hr",
      detail: "At the shop rate the time is worth about $67 against a typical $52 today — about $15 more.",
      evidence: "Median 60 min hands-on, 5 visits, last 90 days. List prices before discounts.",
      href: "/admin/services",
    });
  });

  it("ids carry the service id, not its name", () => {
    const renamed = line({ sizeTier: "XL", serviceName: "Full groom (new)" });
    const bath = line({ serviceId: "bath", serviceName: "Bath", sizeTier: "SMALL" });
    const summary = moneyPerHour(
      [...times(5, () => visit(52, 60, { lines: [renamed] })), ...times(5, () => visit(80, 60, { lines: [bath] }))],
      90
    );
    expect(priceInsights(summary)[0].id).toBe("price-rate:groom:XL");
  });

  it("measures a breed against its own row, not the shop", () => {
    const doodle = { breedKey: "goldendoodle", breedLabel: "Goldendoodle" };
    const lab = { breedKey: "labrador retriever", breedLabel: "Labrador Retriever" };
    const summary = moneyPerHour([...times(5, () => visit(48, 60, doodle)), ...times(5, () => visit(84, 60, lab))], 90);
    expect(summary.rows[0].rateCents).toBe(6600);
    expect(summary.rows[0].gap).toBeNull();
    expect(priceInsights(summary)).toEqual([
      expect.objectContaining({
        id: "price-breed:groom:LARGE:goldendoodle",
        title: "Goldendoodle on Full groom, Large earn $48/hr against $66/hr for the size",
        detail: "About $20 more per visit would bring them level.",
      }),
    ]);
  });

  it("judges no breed while its row is under five visits", () => {
    const doodle = { breedKey: "goldendoodle", breedLabel: "Goldendoodle" };
    const summary = moneyPerHour(times(4, () => visit(48, 60, doodle)), 90);
    expect(summary.rows[0].breeds).toEqual([]);
  });

  it("keeps the three worst, worst first", () => {
    const row = (id: string, dollars: number) =>
      times(5, () => visit(dollars, 60, { lines: [line({ serviceId: id, serviceName: id, sizeTier: "SMALL" })] }));
    const summary = moneyPerHour([...row("a", 40), ...row("b", 44), ...row("c", 48), ...row("d", 36), ...row("e", 150)], 90);
    expect(summary.shopRateCents).toBe(6400);
    expect(priceInsights(summary).map((insight) => insight.id)).toEqual([
      "price-rate:d:SMALL",
      "price-rate:a:SMALL",
      "price-rate:b:SMALL",
    ]);
  });
});
