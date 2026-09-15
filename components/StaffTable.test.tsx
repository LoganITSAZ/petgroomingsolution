// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it } from "vitest";
import StaffTable from "./StaffTable";

beforeEach(() => {
  localStorage.clear();
  // jsdom does not implement the native dialog methods.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(cleanup);

it("saves column choices for the viewer, restores them, and resets defaults", () => {
  const { unmount } = render(<StaffTable profiles={[]} viewerId="one" canManage={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Choose columns" }));
  expect(screen.getByRole("dialog", { name: "Choose columns" })).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Email"));
  fireEvent.click(screen.getByLabelText("Roles"));
  expect(screen.getByRole("columnheader", { name: "Email" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Roles" })).not.toBeInTheDocument();
  unmount();
  render(<StaffTable profiles={[]} viewerId="one" canManage={false} />);
  expect(screen.getByRole("columnheader", { name: "Email" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Roles" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Choose columns" }));
  fireEvent.click(screen.getByText("Reset columns"));
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog", { name: "Choose columns" })).not.toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Email" })).not.toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Roles" })).toBeInTheDocument();
});

it("keeps preferences separate when the viewer changes", () => {
  localStorage.setItem("staff-table-columns:v1:one", '["email","obsolete"]');
  const { rerender } = render(<StaffTable profiles={[]} viewerId="one" canManage={false} />);
  expect(screen.getAllByRole("columnheader")).toHaveLength(2);
  rerender(<StaffTable profiles={[]} viewerId="two" canManage={false} />);
  expect(screen.getByRole("columnheader", { name: "Roles" })).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "Email" })).not.toBeInTheDocument();
});

it("falls back to defaults for corrupt preferences", () => {
  localStorage.setItem("staff-table-columns:v1:one", 'invalid');
  render(<StaffTable profiles={[]} viewerId="one" canManage={false} />);
  expect(screen.getByRole("columnheader", { name: "Roles" })).toBeInTheDocument();
});
