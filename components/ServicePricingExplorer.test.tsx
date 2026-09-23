// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "jest-axe";
import ServicePricingExplorer, { type PricingService } from "./ServicePricingExplorer";

const base: PricingService = {
  id: "groom", name: "Full groom", description: "Coat care", category: "GROOM", species: "DOG",
  priceSmallCents: 4500, priceMediumCents: 6000, priceLargeCents: null, priceXlCents: 10000,
  priceFlatCents: null, priceMaxCents: null, durationMins: 60, walkInEligible: false, offers: [],
};
const services = [base,
  { ...base, id: "cat", name: "Cat groom", species: "CAT", priceSmallCents: null, priceMediumCents: null, priceXlCents: null, priceFlatCents: 8000 },
  { ...base, id: "nails", name: "Nail care", species: null, category: "NAILS", priceSmallCents: null, priceMediumCents: null, priceXlCents: null, priceFlatCents: 1500 },
];

describe("ServicePricingExplorer", () => {
  it("shows ranges immediately and updates size prices without hiding controls", () => {
    render(<ServicePricingExplorer services={services} />);
    expect(screen.getByText("$45–$100")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Small Under 15 lb" }));
    expect(screen.getByText("$45")).toBeInTheDocument();
    expect(screen.getByText("$15")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Large 30–45 lb" }));
    expect(screen.getByText("Price on request")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All sizes Compare prices" }));
    expect(screen.getByText("$45–$100")).toBeInTheDocument();
  });

  it("filters care and resets the category when switching pets, retaining shared services", () => {
    render(<ServicePricingExplorer services={services} />);
    fireEvent.click(screen.getByRole("button", { name: "Nails & paws" }));
    expect(screen.queryByText("Full groom")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cat" }));
    expect(screen.getByText("Cat groom")).toBeInTheDocument();
    expect(screen.getByText("Nail care")).toBeInTheDocument();
    expect(screen.queryByText("Full groom")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Dog size" })).not.toBeInTheDocument();
  });

  it("provides accessible controls and handles an empty menu", async () => {
    const { container } = render(<ServicePricingExplorer services={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("0 services");
    expect(screen.getByText(/No services are currently listed/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
