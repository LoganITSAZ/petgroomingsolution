import { describe, expect, it } from "vitest";
import {
  averageRating,
  ratingLabel,
  readRating,
  testimonialState,
  type TestimonialLike,
} from "./testimonials";

function row(over: Partial<TestimonialLike> = {}): TestimonialLike {
  return { rating: null, approvedAt: new Date(), isActive: true, ...over };
}

describe("testimonialState", () => {
  it("queues anything a manager has not read, active or not", () => {
    expect(testimonialState(row({ approvedAt: null }))).toBe("queued");
    expect(testimonialState(row({ approvedAt: null, isActive: false }))).toBe("queued");
  });

  it("separates published from taken down", () => {
    expect(testimonialState(row())).toBe("published");
    expect(testimonialState(row({ isActive: false }))).toBe("hidden");
  });
});

describe("readRating", () => {
  it("takes the five legal answers", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(readRating(String(n))).toBe(n);
  });

  it("refuses out of range rather than clamping it", () => {
    expect(readRating("9")).toBeNull();
    expect(readRating("0")).toBeNull();
    expect(readRating("-1")).toBeNull();
  });

  it("refuses anything that is not a whole star", () => {
    expect(readRating("4.5")).toBeNull();
    expect(readRating("")).toBeNull();
    expect(readRating(null)).toBeNull();
    expect(readRating("five")).toBeNull();
  });
});

describe("averageRating", () => {
  it("skips the unrated rather than counting them as zero", () => {
    expect(averageRating([row({ rating: 5 }), row({ rating: 4 }), row()])).toBe(4.5);
  });

  it("is null when nothing carries a rating", () => {
    expect(averageRating([row(), row()])).toBeNull();
    expect(averageRating([])).toBeNull();
  });

  it("rounds to one decimal place", () => {
    expect(averageRating([row({ rating: 5 }), row({ rating: 4 }), row({ rating: 4 })])).toBe(4.3);
  });
});

describe("ratingLabel", () => {
  it("reads as words, not stars", () => {
    expect(ratingLabel(4)).toBe("4 out of 5");
  });
});
