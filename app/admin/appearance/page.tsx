import Link from "next/link";
import { getConfig } from "@/lib/config";
import { SHOP_TIMEZONE } from "@/lib/utils";
import {
  THEME_PRESETS,
  resolveTheme,
  seasonalPresetId,
  getPreset,
  themeStyle,
  type ThemePreset,
} from "@/lib/themes";
import { saveAppearance } from "./actions";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Appearance" };

/**
 * How the public site looks. Staff and admin screens are deliberately left
 * alone: the shop's seasonal mood should never make the working screens
 * harder to read.
 */

const NOTICES: Record<string, string> = {
  unknown_preset: "That theme does not exist.",
  bad_color: "Enter a colour as #rrggbb.",
};

function Swatch({ preset, live }: { preset: ThemePreset; live: boolean }) {
  return (
    <label
      className={`block border rounded-xl p-3 cursor-pointer transition-colors ${
        live ? "border-amber-500 bg-amber-50" : "border-stone-200 hover:border-stone-300"
      }`}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="themePreset"
          value={preset.id}
          defaultChecked={live}
          className="accent-amber-700"
        />
        <span className="text-sm font-semibold text-stone-900">
          {preset.motif && <span className="mr-1">{preset.motif}</span>}
          {preset.label}
        </span>
      </span>
      <span className="flex gap-1 mt-2">
        {[
          preset.tokens.brand900,
          preset.tokens.brand700,
          preset.tokens.brand500,
          preset.tokens.brand300,
          preset.tokens.brand100,
          preset.tokens.pageBg,
        ].map((triplet, index) => (
          <span
            key={index}
            className="h-6 flex-1 rounded border border-black/5"
            style={{ background: `rgb(${triplet})` }}
          />
        ))}
      </span>
    </label>
  );
}

interface PageProps {
  searchParams: { saved?: string; error?: string };
}

export default async function AppearancePage({ searchParams }: PageProps) {
  const config = await getConfig();

  const [, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);

  const live = resolveTheme(config, { month, day });
  const calendarPick = getPreset(seasonalPresetId(month, day));
  const errorMessage = searchParams.error ? NOTICES[searchParams.error] : undefined;

  const groups: ThemePreset["group"][] = ["Default", "Seasons", "Holidays"];

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-stone-900">Appearance</h1>
          <p className="text-sm text-stone-500 mt-1">
            Currently showing <span className="font-semibold">{live.preset.label}</span>
            {live.automatic && " — chosen by the calendar"}. Staff and admin screens are not
            affected.
          </p>
        </div>
        <Link href="/" className="text-sm text-amber-700 hover:text-amber-900 underline">
          View the site →
        </Link>
      </div>

      {searchParams.saved === "1" && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 text-green-800 text-sm font-medium">
          Appearance saved.
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-red-800 text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* Live preview of the resolved theme */}
      <div
        style={themeStyle(live.tokens)}
        className="rounded-xl border border-line overflow-hidden bg-page text-ink"
      >
        {live.bannerText && (
          <p className="bg-brand-700 text-brand-on-700 text-center text-xs py-1">
            {live.preset.motif} {live.bannerText}
          </p>
        )}
        <div className="bg-surface border-b border-line px-4 py-2 flex items-center justify-between">
          <span className="font-bold text-brand-text">
            {live.preset.motif ?? "🐾"} {config.shopName}
          </span>
          <span className="bg-brand-600 text-brand-on-600 px-3 py-1 rounded-lg text-xs font-semibold">
            Book Now
          </span>
        </div>
        <div className="px-3 py-2 text-sm">
          <p className="font-semibold">Full Groom</p>
          <p className="text-muted">Bath, cut and style — from $75</p>
        </div>
      </div>

      <form action={saveAppearance} className="space-y-3">
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="themeAutoSeasonal"
              defaultChecked={config.themeAutoSeasonal}
              className="accent-amber-700 mt-1"
            />
            <span className="text-sm">
              <span className="font-semibold text-stone-800">Follow the calendar</span>
              <span className="block text-stone-500">
                Switch automatically through the seasons and holidays. Today that would be{" "}
                <span className="font-medium text-stone-700">
                  {calendarPick.motif} {calendarPick.label}
                </span>
                .
              </span>
            </span>
          </label>
        </div>

        {groups.map((group) => (
          <div key={group} className="bg-white border border-stone-200 rounded-xl p-4">
            <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest mb-3">
              {group}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {THEME_PRESETS.filter((preset) => preset.group === group).map((preset) => (
                <Swatch
                  key={preset.id}
                  preset={preset}
                  live={preset.id === (config.themePreset ?? "default")}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <h2 className="font-bold text-stone-700 text-xs uppercase tracking-widest">
            Shop touches
          </h2>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="useCustomColor"
              defaultChecked={Boolean(config.themeBrandColor)}
              className="accent-amber-700"
            />
            <span className="text-stone-700">Use our own brand colour</span>
            <input
              type="color"
              name="themeBrandColor"
              defaultValue={config.themeBrandColor ?? "#ec8b1a"}
              className="h-8 w-14 rounded border border-stone-200 bg-white"
            />
            <span className="text-xs text-stone-400">
              Replaces the theme&apos;s brand ramp; the rest of the theme stays.
            </span>
          </label>

          <label className="block text-sm">
            <span className="block text-stone-600 mb-1">Banner line (optional)</span>
            <input
              name="themeBannerText"
              defaultValue={config.themeBannerText ?? ""}
              placeholder="Holiday hours: closed Dec 25"
              className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="block text-xs text-stone-400 mt-1">
              Shown across the top of every public page.
            </span>
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-amber-700 hover:bg-amber-800 text-white px-5 py-2 rounded-lg text-sm font-semibold"
          >
            Save Appearance
          </button>
        </div>
      </form>
    </div>
  );
}
