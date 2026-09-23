import { expect, it } from "vitest";
import { sayTwiml } from "./voice";

it("says the message twice and escapes what would break the document", () => {
  const twiml = sayTwiml(`Bark & Bubbles: "Rosie" is ready`);
  expect(twiml).toContain("Bark &amp; Bubbles: &quot;Rosie&quot; is ready");
  expect(twiml).not.toContain("& ");
  expect(twiml.match(/<Say /g)).toHaveLength(2);
  // A raw angle bracket anywhere in the body is a document Twilio rejects.
  expect(twiml.replace(/<[^>]+>/g, "")).not.toMatch(/[<>]/);
});
