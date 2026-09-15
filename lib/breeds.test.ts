import { describe, expect, it } from "vitest";
import { acceptStockPhoto } from "./breeds";

describe("acceptStockPhoto", () => {
  const url =
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/81/Cat.jpg/800px-Cat.jpg?utm_source=api";

  it("takes a loose match either way round and cleans the URL", () => {
    expect(acceptStockPhoto("Persian", "Persian cat", url)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Cat.jpg/800px-Cat.jpg"
    );
    expect(acceptStockPhoto("Standard Poodle", "Poodle", url)).not.toBeNull();
  });

  it("refuses search's best guess at a breed with no article", () => {
    // A picture of somebody else's dog at the station is worse than none.
    expect(acceptStockPhoto("Bernedoodle", "List of dog crossbreeds", url)).toBeNull();
    expect(acceptStockPhoto("Domestic Shorthair", "Oriental Shorthair", url)).toBeNull();
    expect(acceptStockPhoto("Poodle", "Poodle", undefined)).toBeNull();
  });
});
