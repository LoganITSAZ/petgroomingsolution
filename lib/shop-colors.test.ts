import { expect, it } from "vitest";
import {
  SHOP_COLOR_FIELDS, THEME_PRESETS, applyShopColors, colorsFromTokens,
  parseShopColors, resolveTheme, shopColorsFromForm, themeStyle,
} from "./themes";

const settings = {
  themePreset: "default", themeAutoSeasonal: false, themeUseShopColors: true,
  themeBrandColor: "#123456", shopTagline: "Welcome",
};

it("supports every template color and round-trips every palette through the settings form", () => {
  expect(SHOP_COLOR_FIELDS.map(field => field.key).sort()).toEqual(Object.keys(THEME_PRESETS[0].tokens).sort());
  for (const preset of THEME_PRESETS) {
    const form = new FormData();
    for (const [key, value] of Object.entries(colorsFromTokens(preset.tokens))) form.set(`shopColor.${key}`, value);
    const saved = shopColorsFromForm(form);
    expect(saved).not.toBeNull();
    const resolved = resolveTheme({ ...settings, themeShopColors: saved }, { month: 9, day: 13 });
    expect(resolved.tokens).toEqual(preset.tokens);
    expect(themeStyle(resolved.tokens)).toEqual(themeStyle(preset.tokens));
  }
});

it("preserves the legacy brand ramp until a palette is saved", () => {
  const legacy = resolveTheme(settings, { month: 9, day: 13 });
  expect(legacy.tokens.brand500).toBe("18 52 86");
  expect(resolveTheme({ ...settings, themeShopColors: null }, { month: 9, day: 13 }).tokens).toEqual(legacy.tokens);
});

it("does not apply saved shop colors to templates or calendar themes", () => {
  const palette = colorsFromTokens(THEME_PRESETS.find(preset => preset.id === "christmas")!.tokens);
  const template = resolveTheme({ ...settings, themePreset: "ocean", themeUseShopColors: false, themeShopColors: palette }, { month: 9, day: 13 });
  expect(template.tokens).toEqual(THEME_PRESETS.find(preset => preset.id === "ocean")!.tokens);
  const calendar = resolveTheme({ ...settings, themeAutoSeasonal: true, themeShopColors: palette }, { month: 9, day: 13 });
  expect(calendar.tokens).toEqual(THEME_PRESETS.find(preset => preset.id === "autumn")!.tokens);
});

it("rejects missing or invalid form colors and normalizes valid hex", () => {
  const form = new FormData();
  expect(shopColorsFromForm(form)).toBeNull();
  for (const { key } of SHOP_COLOR_FIELDS) form.set(`shopColor.${key}`, " #ABCDEF ");
  expect(shopColorsFromForm(form)?.surface).toBe("#abcdef");
  form.set("shopColor.surface", "red; background:url(example)");
  expect(shopColorsFromForm(form)).toBeNull();
});

it("ignores unknown roles and malformed stored colors", () => {
  const invalid = { surface: "red", ink: 123, footerBg: "#abc", pageBg: "#112233", unknown: "#abcdef" };
  expect(parseShopColors(invalid)).toEqual({ pageBg: "#112233" });
  expect(applyShopColors(THEME_PRESETS[0].tokens, invalid)).toEqual({ ...THEME_PRESETS[0].tokens, pageBg: "17 34 51" });
});
