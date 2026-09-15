// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { axe } from "jest-axe";
import { PageSection, PageShell, Panel, Well } from "./PageShell";

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});

describe("PageShell", () => {
  it("places column controls after page actions and toggles table columns", () => {
    render(<PageShell title="Records" actions={<button type="button">Add record</button>}>
      <table><thead><tr><th>Name</th><th>Email</th></tr></thead>
        <tbody><tr><td>Sam</td><td>sam@example.com</td></tr></tbody>
      </table>
    </PageShell>);
    const trigger = screen.getByRole("button", { name: "Choose columns" });
    expect(trigger.closest("header")).toContainElement(screen.getByRole("button", { name: "Add record" }));
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("checkbox", { name: "Email" }));
    expect(screen.getByText("sam@example.com")).toHaveAttribute("data-column-hidden");
    expect(screen.getByText("Sam")).not.toHaveAttribute("data-column-hidden");
    fireEvent.click(screen.getByRole("button", { name: "Reset columns" }));
    expect(screen.getByText("sam@example.com")).not.toHaveAttribute("data-column-hidden");
  });
  it("renders a polished single-card surface with a subtle ring and depth", () => {
    render(
      <PageShell title="Schedule" subtitle="This week">
        <p>Body copy</p>
      </PageShell>
    );

    const card = screen.getByText("Body copy").closest("section");
    expect(card).toHaveClass("bg-surface", "shadow-card");
  });

  // A well is a recess, so it is drawn with a hairline rather than a shadow —
  // a raised inset is a contradiction, and a shop terminal showing twenty of
  // them read as a pile of floating chips.
  it("renders inset wells as a recess, with no elevation of their own", () => {
    render(
      <Well>
        <span>Inset content</span>
      </Well>
    );

    const well = screen.getByText("Inset content").closest("div");
    expect(well).toHaveClass("bg-well", "border-well-line");
    expect(well?.className).not.toMatch(/shadow|hover:/);
  });

  it("renders summary panels on the same recessed finish", () => {
    render(
      <Panel title="Today">
        <span>Panel body</span>
      </Panel>
    );

    const panel = screen.getByText("Panel body").closest("div");
    expect(panel).toHaveClass("bg-well", "border-well-line");
    expect(panel?.className).not.toMatch(/shadow|hover:|translate/);
  });

  // The action belongs to the surface it acts on. A button outside the card
  // reads as chrome, and it was outside on one screen and inside on others.
  it("renders the page action inside the card", () => {
    render(
      <PageShell title="Appointments" actions={<button type="button">+ New</button>}>
        <p>Body copy</p>
      </PageShell>
    );

    const card = screen.getByText("Body copy").closest("section");
    expect(card).toContainElement(screen.getByRole("button", { name: "+ New" }));
  });

  it("renders the back link with keyboard-visible focus styling", () => {
    render(
      <PageShell title="Schedule" back={{ href: "/staff", label: "Back to staff" }}>
        <div>Body</div>
      </PageShell>
    );

    expect(screen.getByRole("link", { name: /back to staff/i })).toHaveClass(
      "focus-visible:outline-none",
        "focus-visible:ring-2",
          "focus-visible:ring-well-line/80",
            "focus-visible:ring-offset-2"
    );
  });

  /* Every back-office screen is one of these, so a fault in the primitive is a
     fault on forty pages. The landmark rules are off: a test renders a
     fragment, not a document, and the real page puts this inside the shell's
     <main>. */
  it("has no axe violations", async () => {
    const { container } = render(
      <PageShell
        title="Schedule"
        subtitle="This week"
        back={{ href: "/staff", label: "Back to staff" }}
      >
        <PageSection title="Filters" tone="muted">
          <div>Filter rows</div>
        </PageSection>
        <PageSection>
          <Panel title="Today">
            <Well>
              <span>Inset content</span>
            </Well>
          </Panel>
        </PageSection>
      </PageShell>
    );

    expect(
      await axe(container, { rules: { region: { enabled: false } } })
    ).toHaveNoViolations();
  });

  it("renders muted sections with a single divider and a bordered heading", () => {
    render(
      <PageSection title="Filters" tone="muted">
        <div>Filter rows</div>
      </PageSection>
    );

    const heading = screen.getByText("Filters").closest("div");
    expect(heading).toHaveClass("border-b", "border-well-line");
    expect(heading?.parentElement).toHaveClass("bg-band", "border-t", "border-well-line");
    expect(heading?.parentElement?.className).not.toContain("shadow-");
  });
});
