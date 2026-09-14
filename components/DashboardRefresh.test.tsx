// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardRefresh } from "./DashboardRefresh";

const { refresh, router } = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, router: { refresh } };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); refresh.mockClear(); });

describe("dashboard refresh", () => {
  it("refreshes every minute and stops after unmount", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { unmount } = render(<DashboardRefresh updatedAt="2026-09-13T12:00:00Z" />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);
    unmount();
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("skips hidden tabs and active forms, but allows manual refresh", () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<><DashboardRefresh updatedAt="2026-09-13T12:00:00Z" /><form><input aria-label="Appointment" /></form></>);
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    screen.getByLabelText("Appointment").focus();
    act(() => vi.advanceTimersByTime(60_000));
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Refresh/ }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
