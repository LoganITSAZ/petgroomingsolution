// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PageColumnsButton from "./PageColumnsButton";

vi.mock("next/navigation", () => ({ usePathname: () => "/test-columns" }));
vi.mock("./Modal", () => ({ default: ({ open, children }: { open: boolean; children: React.ReactNode }) => open ? <div>{children}</div> : null }));

describe("PageColumnsButton", () => {
  it("uses a separate portal host and moves the control when its column is hidden", async () => {
    const { container, unmount } = render(<section>
      <PageColumnsButton />
      <table><thead><tr><th>Name</th><th>Status</th></tr></thead>
        <tbody><tr><td>Fido</td><td>Ready</td></tr></tbody>
      </table>
    </section>);
    const control = await screen.findByRole("button", { name: "Choose columns" });
    const headers = container.querySelectorAll("th");
    expect(control.parentElement?.tagName).toBe("SPAN");
    expect(headers[1].contains(control)).toBe(true);
    fireEvent.click(control);
    fireEvent.click(screen.getByRole("checkbox", { name: "Status" }));
    await waitFor(() => expect(headers[0].contains(screen.getByRole("button", { name: "Choose columns" }))).toBe(true));
    expect(headers[1].hasAttribute("data-column-hidden")).toBe(true);
    expect(headers[1].textContent).toBe("Status");
    unmount();
    expect(headers[0].querySelector("span")).toBeNull();
    localStorage.clear();
  });
});
