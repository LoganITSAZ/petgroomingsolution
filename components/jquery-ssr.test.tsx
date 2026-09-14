// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import FloorBoard from "./FloorBoard";
import MultiPicker from "./MultiPicker";
import TagPicker from "./TagPicker";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("jQuery components during server rendering", () => {
  it("imports and renders without a browser document", () => {
    expect(typeof window).toBe("undefined");
    expect(() => renderToString(
      <>
        <FloorBoard pets={[]} capacity={{}} move={async () => ({ ok: true })} />
        <MultiPicker options={[]} name="services" />
        <TagPicker options={[]} name="tags" />
      </>
    )).not.toThrow();
  });
});
