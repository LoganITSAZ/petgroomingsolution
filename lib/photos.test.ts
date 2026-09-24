import { expect, it } from "vitest";
import { MAX_PHOTO_BYTES, decodeImageDataUrl } from "./photos";

const onePixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/gEBpQ1mAAAAAElFTkSuQmCC";

it("decodes a canvas data URL", () => {
  const decoded = decodeImageDataUrl(onePixel);
  expect(decoded).not.toBeNull();
  if (!decoded || "error" in decoded) throw new Error("expected bytes");
  expect(decoded.mimeType).toBe("image/png");
  expect(decoded.data.byteLength).toBeGreaterThan(0);
});

it("treats a data: prefix as a claim, not a fact", () => {
  // Not an image type at all.
  expect(decodeImageDataUrl("data:text/html;base64,PHNjcmlwdD4=")).toEqual({ error: "bad_type" });
  // Not a data URL.
  expect(decodeImageDataUrl("javascript:alert(1)")).toEqual({ error: "bad_type" });
  // Nothing drawn.
  expect(decodeImageDataUrl("")).toBeNull();
  expect(decodeImageDataUrl(null)).toBeNull();
  // Same cap as an upload: base64 inflates, and a canvas cannot be trusted.
  const huge = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_PHOTO_BYTES + 1024) / 3) * 4)}`;
  expect(decodeImageDataUrl(huge)).toEqual({ error: "too_large" });
});
