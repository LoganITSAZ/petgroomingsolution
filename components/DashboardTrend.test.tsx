// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ShopAnalytics } from "@/lib/analytics";
import { DashboardTrend } from "./DashboardTrend";

vi.mock("@/components/ui", () => ({ PageSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
const snapshot: ShopAnalytics = {
  rangeDays: 7, booked: 3, finished: 3, cancelled: 0, noShows: 0,
  walkIns: 0, scheduledAppointments: 3, noShowRate: 0, avgTurnaroundMins: null,
  estimatedRevenueCents: 15000, rateDiscountCents: 0, pricedShare: 1,
  perDay: [{ dayKey: "2026-09-12", finished: 3 }], serviceMix: [], newCustomers: 0, returningShare: 0,
};
describe("DashboardTrend", () => {
  it("fills missing dates with zero and includes the current day", () => {
    render(<DashboardTrend snapshot={snapshot} todayKey="2026-09-13" canManageShop={false} />);
    const chart = screen.getByRole("img");
    expect(chart).toHaveAttribute("aria-label", expect.stringContaining("2026-09-07: 0 finished"));
    expect(chart).toHaveAttribute("aria-label", expect.stringContaining("2026-09-12: 3 finished"));
    expect(chart).toHaveAttribute("aria-label", expect.stringContaining("2026-09-13: 0 finished"));
    expect(screen.queryByText("Estimated service revenue")).not.toBeInTheDocument();
  });
  it("labels manager revenue as estimated and reports pricing coverage", () => {
    render(<DashboardTrend snapshot={snapshot} todayKey="2026-09-13" canManageShop />);
    expect(screen.getByText("Estimated service revenue")).toBeInTheDocument();
    expect(screen.getByText(/not collected payments/)).toHaveTextContent("100% of finished visits have pricing");
  });
  it("handles an empty week without invalid chart heights", () => {
    const { container } = render(<DashboardTrend snapshot={{ ...snapshot, finished: 0, perDay: [] }} todayKey="2026-01-02" canManageShop={false} />);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringContaining("2025-12-27: 0 finished"));
    expect(screen.getByText(/No finished grooms recorded/)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});
