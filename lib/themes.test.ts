import { describe, expect, it } from "vitest";
import { THEME_PRESETS, resolveTheme, brandText, darkTokens, type ThemeTokens } from "@/lib/themes";

/**
 * A shop can pick any of these themes, and now any of them in either mode.
 * The light half was hand-checked once; the dark half is derived, so nothing
 * but arithmetic stands between a seasonal preset and a 2:1 dark mode. These
 * pin the pairs a visitor actually reads.
 */

function luminance(triplet: string): number {
  const [r, g, b] = triplet.split(" ").map((channel) => {
    const value = Number(channel) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function readablePairs(tokens: ThemeTokens): [string, number][] {
  return [
    ["ink on surface", contrast(tokens.ink, tokens.surface)],
    ["ink on page", contrast(tokens.ink, tokens.pageBg)],
    ["muted on surface", contrast(tokens.muted, tokens.surface)],
    ["muted on page", contrast(tokens.muted, tokens.pageBg)],
    ["brand text on surface", contrast(brandText(tokens), tokens.surface)],
    ["footer ink on footer", contrast(tokens.footerInk, tokens.footerBg)],
  ];
}

describe("public theme contrast", () => {
  for (const preset of THEME_PRESETS) {
    it(`${preset.label} clears AA in light mode`, () => {
      for (const [what, ratio] of readablePairs(preset.tokens)) {
        expect(`${what}: ${ratio.toFixed(2)}`).toBe(`${what}: ${Math.max(ratio, 4.5).toFixed(2)}`);
      }
    });

    it(`${preset.label} clears AA in dark mode`, () => {
      for (const [what, ratio] of readablePairs(darkTokens(preset.tokens))) {
        expect(`${what}: ${ratio.toFixed(2)}`).toBe(`${what}: ${Math.max(ratio, 4.5).toFixed(2)}`);
      }
    });
  }
});

describe("brandText", () => {
  it("moves the brand away from the surface in whichever direction the surface is", () => {
    const amber = THEME_PRESETS[0].tokens;
    const light = brandText(amber);
    const dark = brandText(darkTokens(amber));
    // Light mode darkens the ramp, dark mode lightens it — otherwise a link on
    // a near-black card is painted in the same near-black brown.
    expect(luminance(dark)).toBeGreaterThan(luminance(light));
  });

  it("leaves the brand alone when it already clears AA", () => {
    const tokens = { ...THEME_PRESETS[0].tokens, brand700: "0 0 0" };
    expect(brandText(tokens)).toBe("0 0 0");
  });
});

 it("can disable shop colors without discarding the saved brand color or banner", () => {
  const settings = { themePreset: "default", themeAutoSeasonal: false, themeBrandColor: "#123456", shopTagline: "Welcome" };
  const enabled = resolveTheme({ ...settings, themeUseShopColors: true }, { month: 9, day: 13 });
  const disabled = resolveTheme({ ...settings, themeUseShopColors: false }, { month: 9, day: 13 });
  expect(enabled.tokens).not.toEqual(disabled.tokens);
  expect(disabled.tokens).toEqual(disabled.preset.tokens);
  expect(disabled.bannerText).toBe("Welcome");
  expect(settings.themeBrandColor).toBe("#123456");
 });
