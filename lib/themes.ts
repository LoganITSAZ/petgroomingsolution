/**
 * Shared shop theming.
 *
 * The website and back office share the configured palette and seasonal
 * calendar. Contrast tokens adapt to each screen’s light or dark preference;
 * operational status colors stay independent of the brand.
 */

export interface ThemeTokens {
  /** Brand ramp, as "R G B" so Tailwind can apply opacity. */
  brand100: string;
  brand300: string;
  brand500: string;
  brand600: string;
  brand700: string;
  brand900: string;
  /** Page surfaces and text. */
  pageBg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  footerBg: string;
  footerInk: string;
}

export interface ThemePreset {
  id: string;
  label: string;
  group: "Default" | "Seasons" | "Holidays";
  /** Shown beside the shop name when this theme is live. */
  motif?: string;
  tokens: ThemeTokens;
}

export const SHOP_COLOR_FIELDS = [
  { key: "brand100", label: "Soft accent", hint: "Pale background glow and navigation highlights.", group: "Accents and buttons" },
  { key: "brand300", label: "Secondary accent", hint: "Secondary button borders and background highlights.", group: "Accents and buttons" },
  { key: "brand500", label: "Main accent", hint: "Decorative background color, focus rings, and hover borders.", group: "Accents and buttons" },
  { key: "brand600", label: "Primary buttons", hint: "Book Now, booking buttons, and the mobile menu button.", group: "Accents and buttons" },
  { key: "brand700", label: "Banner, links, and button hover", hint: "Tagline banner, shop name, links, and primary buttons on hover.", group: "Accents and buttons" },
  { key: "brand900", label: "Deep accent", hint: "Card and button shadows and the subtle background pattern.", group: "Accents and buttons" },
  { key: "pageBg", label: "Page background", hint: "The base behind the site's decorative background.", group: "Backgrounds and text" },
  { key: "surface", label: "Cards and navigation", hint: "Card, navigation bar, and secondary button backgrounds; glass panels use a translucent version.", group: "Backgrounds and text" },
  { key: "ink", label: "Main text", hint: "Page headings, body text, and secondary button labels.", group: "Backgrounds and text" },
  { key: "muted", label: "Supporting text", hint: "Descriptions, hours, and other secondary information.", group: "Backgrounds and text" },
  { key: "line", label: "Borders and dividers", hint: "Theme borders around content and between sections.", group: "Backgrounds and text" },
  { key: "footerBg", label: "Footer background", hint: "The bottom section containing shop details, hours, and contact information.", group: "Backgrounds and text" },
  { key: "footerInk", label: "Footer text", hint: "Shop details, hours, and contact information in the footer.", group: "Backgrounds and text" },
] as const satisfies readonly { key: keyof ThemeTokens; label: string; hint: string; group: string }[];

export type ShopColors = Partial<Record<keyof ThemeTokens, string>>;

/** Only known color roles and valid hex values can become CSS values. */
export function parseShopColors(value: unknown): ShopColors {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: ShopColors = {};
  for (const { key } of SHOP_COLOR_FIELDS) {
    const color = (value as Record<string, unknown>)[key];
    if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color.trim())) {
      result[key] = color.trim().toLowerCase();
    }
  }
  return result;
}

export function shopColorsFromForm(form: FormData): ShopColors | null {
  const colors: ShopColors = {};
  for (const { key } of SHOP_COLOR_FIELDS) {
    const value = form.get(`shopColor.${key}`);
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value.trim())) return null;
    colors[key] = value.trim().toLowerCase();
  }
  return colors;
}

export function colorsFromTokens(tokens: ThemeTokens): Record<keyof ThemeTokens, string> {
  return Object.fromEntries(SHOP_COLOR_FIELDS.map(({ key }) => [key,
    `#${tokens[key].split(" ").map(channel => Number(channel).toString(16).padStart(2, "0")).join("")}`,
  ])) as Record<keyof ThemeTokens, string>;
}

export function applyShopColors(base: ThemeTokens, value: unknown): ThemeTokens {
  const tokens = { ...base };
  for (const [key, color] of Object.entries(parseShopColors(value))) {
    tokens[key as keyof ThemeTokens] = hexToRgbTriplet(color)!;
  }
  return tokens;
}

const AMBER: ThemeTokens = {
  brand100: "253 240 213",
  brand300: "245 198 116",
  brand500: "236 139 26",
  brand600: "221 112 16",
  brand700: "183 83 16",
  brand900: "118 55 20",
  pageBg: "245 244 240",
  surface: "255 255 255",
  ink: "28 25 23",
  muted: "114 107 102",
  line: "231 229 228",
  footerBg: "26 25 23",
  footerInk: "214 211 209",
};

export const THEME_PRESETS: ThemePreset[] = [
  { id: "default", label: "Amber", group: "Default", tokens: AMBER },
  // Year-round palettes share the neutral surfaces and accessible text tokens.
  ...[
    { id: "sage", label: "Sage", color: "#64876b" },
    { id: "forest", label: "Forest", color: "#28734f" },
    { id: "teal", label: "Teal", color: "#0d9488" },
    { id: "ocean", label: "Ocean", color: "#247bb5" },
    { id: "indigo", label: "Indigo", color: "#6154b8" },
    { id: "lavender", label: "Lavender", color: "#9770bb" },
    { id: "rose", label: "Rose", color: "#c65c7a" },
    { id: "terracotta", label: "Terracotta", color: "#bb6546" },
    { id: "espresso", label: "Espresso", color: "#795548" },
    { id: "slate", label: "Slate", color: "#64748b" },
  ].map(({ id, label, color }): ThemePreset => ({
    id,
    label,
    group: "Default",
    tokens: rampFromColor(color, AMBER),
  })),


  {
    id: "spring",
    label: "Spring",
    group: "Seasons",
    motif: "🌷",
    tokens: {
      ...AMBER,
      brand100: "220 252 231",
      brand300: "134 239 172",
      brand500: "34 197 94",
      brand600: "22 163 74",
      brand700: "21 128 61",
      brand900: "20 83 45",
      pageBg: "247 254 249",
      line: "220 236 226",
      footerBg: "20 60 40",
      footerInk: "209 231 219",
    },
  },
  {
    id: "summer",
    label: "Summer",
    group: "Seasons",
    motif: "🌊",
    tokens: {
      ...AMBER,
      brand100: "224 242 254",
      brand300: "125 211 252",
      brand500: "14 165 233",
      brand600: "2 132 199",
      brand700: "3 105 161",
      brand900: "12 74 110",
      pageBg: "247 252 255",
      line: "214 233 245",
      footerBg: "12 55 80",
      footerInk: "203 228 243",
    },
  },
  {
    id: "autumn",
    label: "Autumn",
    group: "Seasons",
    motif: "🍂",
    tokens: {
      ...AMBER,
      brand100: "254 226 199",
      brand300: "251 165 96",
      brand500: "217 105 27",
      brand600: "184 82 18",
      brand700: "146 64 14",
      brand900: "97 44 12",
      pageBg: "253 250 245",
      line: "236 226 213",
      footerBg: "60 36 20",
      footerInk: "231 219 205",
    },
  },
  {
    id: "winter",
    label: "Winter",
    group: "Seasons",
    motif: "❄️",
    tokens: {
      ...AMBER,
      brand100: "226 232 240",
      brand300: "148 163 184",
      brand500: "71 105 148",
      brand600: "51 85 128",
      brand700: "38 66 102",
      brand900: "24 44 70",
      pageBg: "248 250 252",
      line: "222 230 238",
      footerBg: "24 38 56",
      footerInk: "209 220 232",
    },
  },

  {
    id: "valentines",
    label: "Valentine's",
    group: "Holidays",
    motif: "💗",
    tokens: {
      ...AMBER,
      brand100: "252 231 243",
      brand300: "249 168 212",
      brand500: "236 72 153",
      brand600: "219 39 119",
      brand700: "190 24 93",
      brand900: "131 24 67",
      pageBg: "255 250 252",
      line: "244 226 235",
      footerBg: "84 20 48",
      footerInk: "246 222 233",
    },
  },
  {
    id: "independence",
    label: "Independence Day",
    group: "Holidays",
    motif: "🎆",
    tokens: {
      ...AMBER,
      brand100: "219 234 254",
      brand300: "147 197 253",
      brand500: "220 38 38",
      brand600: "185 28 28",
      brand700: "30 64 175",
      brand900: "23 37 84",
      pageBg: "250 251 255",
      line: "220 228 242",
      footerBg: "23 37 84",
      footerInk: "219 234 254",
    },
  },
  {
    id: "halloween",
    label: "Halloween",
    group: "Holidays",
    motif: "🎃",
    tokens: {
      ...AMBER,
      brand100: "255 237 213",
      brand300: "253 186 116",
      brand500: "234 88 12",
      brand600: "194 65 12",
      brand700: "124 45 18",
      brand900: "67 20 7",
      pageBg: "252 249 245",
      ink: "32 26 30",
      line: "234 224 220",
      footerBg: "34 22 40",
      footerInk: "233 213 240",
    },
  },
  {
    id: "christmas",
    label: "Christmas",
    group: "Holidays",
    motif: "🎄",
    tokens: {
      ...AMBER,
      brand100: "220 252 231",
      brand300: "252 165 165",
      brand500: "185 28 28",
      brand600: "153 27 27",
      brand700: "22 101 52",
      brand900: "20 83 45",
      pageBg: "252 250 249",
      line: "230 228 224",
      footerBg: "20 55 38",
      footerInk: "220 244 230",
    },
  },
  {
    id: "new-year",
    label: "New Year",
    group: "Holidays",
    motif: "🥂",
    tokens: {
      ...AMBER,
      brand100: "245 236 205",
      brand300: "226 199 122",
      brand500: "180 141 47",
      brand600: "146 112 32",
      brand700: "63 63 70",
      brand900: "24 24 27",
      pageBg: "250 249 246",
      line: "231 226 214",
      footerBg: "24 24 27",
      footerInk: "228 224 213",
    },
  },
];

const DEFAULT_THEME_ID = "default";

export function getPreset(id: string | null | undefined): ThemePreset {
  return (
    THEME_PRESETS.find((preset) => preset.id === id) ??
    THEME_PRESETS.find((preset) => preset.id === DEFAULT_THEME_ID)!
  );
}

/**
 * Which preset the calendar calls for. Holidays win over the season they fall
 * in; everything is evaluated on the shop's own date, not the viewer's.
 */
export function seasonalPresetId(month: number, day: number): string {
  // Holidays first — narrow windows around the day itself.
  if (month === 2 && day >= 7 && day <= 15) return "valentines";
  if ((month === 6 && day >= 28) || (month === 7 && day <= 6)) return "independence";
  if ((month === 10 && day >= 20) || (month === 11 && day === 1)) return "halloween";
  if (month === 12 && day >= 1 && day <= 26) return "christmas";
  if ((month === 12 && day >= 27) || (month === 1 && day <= 2)) return "new-year";

  // Otherwise the season.
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

/** Hex (#rrggbb) to the "R G B" form the CSS variables use. */
export function hexToRgbTriplet(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

function shift(triplet: string, amount: number): string {
  return triplet
    .split(" ")
    .map((channel) => {
      const value = Number(channel);
      const shifted = amount >= 0 ? value + (255 - value) * amount : value * (1 + amount);
      return Math.max(0, Math.min(255, Math.round(shifted)));
    })
    .join(" ");
}

/** A full ramp from one brand colour, for shops that want their own. */
function rampFromColor(hex: string, base: ThemeTokens): ThemeTokens {
  const triplet = hexToRgbTriplet(hex);
  if (!triplet) return base;
  return {
    ...base,
    brand100: shift(triplet, 0.85),
    brand300: shift(triplet, 0.45),
    brand500: triplet,
    brand600: shift(triplet, -0.12),
    brand700: shift(triplet, -0.28),
    brand900: shift(triplet, -0.55),
  };
}

export interface ThemeSettings {
  themePreset: string;
  themeAutoSeasonal: boolean;
  themeBrandColor: string | null;
  themeShopColors?: unknown;
  themeUseShopColors?: boolean;
  shopTagline: string | null;
}

export interface ResolvedTheme {
  preset: ThemePreset;
  tokens: ThemeTokens;
  bannerText: string | null;
  /** True when the calendar chose it rather than the admin. */
  automatic: boolean;
}

/** The theme the website and dashboard should paint right now. */
export function resolveTheme(
  settings: ThemeSettings,
  now: { month: number; day: number }
): ResolvedTheme {
  const automatic = settings.themeAutoSeasonal;
  const preset = getPreset(
    automatic ? seasonalPresetId(now.month, now.day) : settings.themeUseShopColors === true ? "default" : settings.themePreset
  );
  const useShopColors = !automatic && settings.themeUseShopColors !== false;
  const base = useShopColors && settings.themeBrandColor
    ? rampFromColor(settings.themeBrandColor, preset.tokens) : preset.tokens;
  const tokens = useShopColors ? applyShopColors(base, settings.themeShopColors) : base;

  return {
    preset,
    tokens,
    bannerText: settings.shopTagline?.trim() || null,
    automatic,
  };
}

/**
 * Relative luminance of an "R G B" triplet, per WCAG 2.x.
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

/**
 * Readable text for a brand fill.
 *
 * A shop can pick any brand colour it likes, and white-on-brand is only
 * legible for the dark half of that range — the amber default is 3.3:1 behind
 * white, and a yellow brand is under 2:1. Rather than distort the colour the
 * shop chose, pick the foreground: whichever of white or the theme's ink has
 * more contrast against the fill. Exported for the tests that pin this.
 */
export function onBrand(fill: string, ink: string): string {
  const white = "255 255 255";
  return contrast(fill, white) >= contrast(fill, ink) ? white : ink;
}

/** A translucent fill composited over what sits behind it. */
function over(fill: string, ground: string, alpha: number): string {
  const behind = ground.split(" ");
  return fill
    .split(" ")
    .map((channel, index) => Math.round(Number(channel) * alpha + Number(behind[index]) * (1 - alpha)))
    .join(" ");
}

function scale(triplet: string, factor: number): string {
  return triplet
    .split(" ")
    .map((channel) => {
      const value = Number(channel);
      const moved = factor >= 1 ? value + (255 - value) * (factor - 1) : value * factor;
      return Math.max(0, Math.min(255, Math.round(moved)));
    })
    .join(" ");
}

/**
 * A brand fill that some foreground can actually sit on.
 *
 * onBrand() picks the better of white and ink, but a mid-tone colour is a poor ground
 * for both — around 4.2:1 at worst, just under AA. Where that happens the
 * fill itself moves, away from whichever foreground won, until the pair
 * clears 4.5:1. Most themes are untouched; the ones that shift, shift by a
 * few percent and keep their hue.
 */
export function readableFill(fill: string, ink: string): string {
  const target = 4.5;
  let current = fill;
  const foreground = onBrand(fill, ink);
  const darken = foreground === "255 255 255";

  for (let step = 0; step < 24; step++) {
    if (contrast(current, foreground) >= target) break;
    current = scale(current, darken ? 0.94 : 1.06);
  }
  return current;
}

/**
 * The brand colour as *text* on the page.
 *
 * A fill only has to be legible under whichever foreground onBrand() picks,
 * which says nothing about reading brand-coloured type on a white card — a
 * pale brand is fine as a button and unreadable as a link. This moves the
 * ramp's 700 against the theme's own surface until it clears AA, and every
 * brand-coloured word on the site paints from it.
 *
 * The direction is read off the surface rather than assumed: the same amber
 * that has to be darkened to read on a white card has to be *lightened* to
 * read on a near-black one, and a fixed "darken" would paint a dark-mode link
 * in the same brown as the card behind it.
 */
export function brandText(tokens: ThemeTokens): string {
  const darken = luminance(tokens.surface) > 0.18;
  // Brand type rarely sits on the bare surface: the badges and tinted cards it
  // heads are brand-100 over that surface, which moves the ground away from
  // white in light mode and towards it in dark. Clear AA on both grounds, or
  // the one pair that is always a heading is the one pair that fails.
  const grounds = [tokens.surface, over(tokens.brand100, tokens.surface, 0.65)];
  let current = tokens.brand700;
  for (let step = 0; step < 24; step++) {
    if (grounds.every((ground) => contrast(current, ground) >= 4.5)) break;
    current = scale(current, darken ? 0.9 : 1.12);
  }
  return current;
}

/**
 * The dark half of a theme.
 *
 * Derived rather than hand-authored: there are a dozen presets and the shop
 * can also supply its own brand colour, so a second set of typed-in palettes
 * would be a dozen chances to ship an unreadable one. The brand ramp survives
 * — a theme is its colour — and only the surfaces and type it sits on swap.
 * lib/themes.test.ts holds every preset to AA in both modes; a preset that
 * fails is a preset to hand-tune, not a reason to loosen this.
 */
export function darkTokens(tokens: ThemeTokens): ThemeTokens {
  const surface = "33 32 29";
  return {
    ...tokens,
    // The pale end of the ramp is not a colour, it is a background: every
    // tinted badge, card and toolbar on the site is brand-100 (and its border
    // brand-300) over the surface. Carried across unchanged it stays cream
    // under a near-white ink — about 2.2:1 — so it is re-derived as the same
    // brand mixed towards the dark surface. The fills (500/600/700) are the
    // theme's actual colour and survive untouched.
    brand100: over(tokens.brand500, surface, 0.16),
    brand300: over(tokens.brand500, surface, 0.42),
    pageBg: "19 18 17",
    surface,
    ink: "245 244 242",
    muted: "171 167 162",
    line: "70 67 61",
    footerBg: "19 18 17",
    footerInk: "214 211 209",
  };
}

/**
 * Both halves of a theme as a stylesheet.
 *
 * The light set can be an inline `style` on the wrapper, but the dark set
 * cannot — an element has one style attribute — so the public layout emits
 * this instead and toggles a `dark` class on `#public-root`. Values come from
 * themeStyle(), so the contrast tokens are resolved per mode: the same brand
 * needs a different `--brand-text` on a near-black card than on a white one.
 */
export function themeCss(tokens: ThemeTokens, selector = "#public-root"): string {
  const block = (mode: ThemeTokens) =>
    Object.entries(themeStyle(mode))
      .map(([name, value]) => `${name}:${value};`)
      .join("");

  return `${selector}{${block(tokens)}}${selector}.dark{${block(darkTokens(tokens))}}`;
}

/** CSS custom properties for a theme, applied to a wrapping element. */
export function themeStyle(tokens: ThemeTokens): Record<string, string> {
  const brand600 = readableFill(tokens.brand600, tokens.ink);
  const brand700 = readableFill(tokens.brand700, tokens.ink);

  return {
    "--brand-on-600": onBrand(brand600, tokens.ink),
    "--brand-on-700": onBrand(brand700, tokens.ink),
    "--brand-text": brandText(tokens),
    "--brand-100": tokens.brand100,
    "--brand-300": tokens.brand300,
    "--brand-500": tokens.brand500,
    "--brand-600": brand600,
    "--brand-700": brand700,
    "--brand-900": tokens.brand900,
    "--page-bg": tokens.pageBg,
    "--surface": tokens.surface,
    "--ink": tokens.ink,
    "--muted": tokens.muted,
    "--line": tokens.line,
    "--footer-bg": tokens.footerBg,
    "--footer-ink": tokens.footerInk,
  };
}
