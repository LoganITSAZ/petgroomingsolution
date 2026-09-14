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
import { PageShell, PageSection } from "@/components/ui";
import SaveToast from "@/components/SaveToast";

// Screen readers announce the title first; without one every page in the
// app reads as the same document (WCAG 2.4.2).
export const metadata = { title: "Appearance" };

/**
 * The website and dashboard share this palette. Staff retain their own
 * light/dark preference, and operational signals keep their status colors.
 */

const NOTICES: Record<string, string> = {
  unknown_preset: "That theme does not exist.",
};

function Swatch({ preset, live }: { preset: ThemePreset; live: boolean }) {
  return (
    <label
      className="block border border-stone-200 rounded-xl p-3 cursor-pointer transition-colors hover:border-stone-300 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50"
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="themeChoice"
          value={`template:${preset.id}`}
          defaultChecked={live}
          className="accent-amber-700"
        />
        <span className="text-sm font-semibold text-stone-900">
          {preset.motif && <span className="mr-1">{preset.motif}</span>}
          {preset.label}
        </span>
        {preset.id === "default" && (
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">Default</span>
        )}
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
  searchParams: Promise<{ saved?: string; error?: string }>;
}

export default async function AppearancePage(props: PageProps) {
  const searchParams = await props.searchParams;
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

  const choice = config.themeAutoSeasonal ? "calendar" : config.themeUseShopColors ? "shop" : `template:${config.themePreset ?? "default"}`;
  const live = resolveTheme(config, { month, day });
  const calendarPick = getPreset(seasonalPresetId(month, day));
  const errorMessage = searchParams.error ? NOTICES[searchParams.error] : undefined;


  return (
    <PageShell
      title="Appearance"
      subtitle={
        <>
          Currently showing <span className="font-semibold">{live.preset.label}</span>
          {live.automatic && " — chosen by the calendar"}. Staff and admin screens are not
          affected.
        </>
      }
      actions={
        <Link href="/" className="inline-flex items-center justify-center rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2">
          View the Site
        </Link>
      }
    >

      {searchParams.saved === "1" && (
        <SaveToast>
          Appearance saved.
        </SaveToast>
      )}
      {errorMessage && (
        <SaveToast tone="error">
          {errorMessage}
        </SaveToast>
      )}

      <form action={saveAppearance}>
        <PageSection title="Theme options">
          <fieldset className="space-y-3">
            <legend className="sr-only">Theme options</legend>
            <label className="flex items-start gap-3">
              <input type="radio" name="themeChoice" value="calendar" defaultChecked={choice === "calendar"} className="accent-amber-700 mt-1" />
              <span className="text-sm">
                <span className="font-semibold text-stone-800">Follow the calendar</span>
                <span className="block text-stone-500">
                  Switch automatically through the seasons and holidays. Today that would be{" "}
                  <span className="font-medium text-stone-700">{calendarPick.motif} {calendarPick.label}</span>.
                </span>
              </span>
            </label>
            <div>
              <label className="flex items-center gap-3 text-sm">
                <input type="radio" name="themeChoice" value="shop" defaultChecked={choice === "shop"} className="accent-amber-700" aria-describedby="shop-colors-description" />
                <span className="font-semibold text-stone-800">Use shop colors</span>
              </label>
              <p id="shop-colors-description" className="mt-1 text-sm text-stone-500">
                Use your saved palette with the default layout. Set your brand colors and tagline in{" "}
                <Link href="/admin/settings#shop-branding" className="text-amber-700 underline">Shop Settings</Link>.
              </p>
            </div>
          </fieldset>
        </PageSection>

      {/* Live preview of the resolved theme */}
      <PageSection title="Live preview" tone="muted">
      <div
        style={themeStyle(live.tokens)}
        className="rounded-lg border border-line overflow-hidden bg-page text-ink"
      >
        {live.bannerText && (
          <p className="bg-brand-700 text-brand-on-700 text-center text-xs py-1">
            {live.preset.motif} {live.bannerText}
          </p>
        )}
        <div className="bg-surface border-b border-line px-4 py-2 flex items-center justify-between">
          <span className="font-bold text-brand-text">
            <span aria-hidden="true">{live.preset.motif ?? "🐾"}</span> {config.shopName}
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
      </PageSection>

        <PageSection title="Color templates">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {THEME_PRESETS.map((preset) => (
              <Swatch key={preset.id} preset={preset} live={choice === `template:${preset.id}`} />
            ))}
          </div>
        </PageSection>

        <PageSection tone="muted" bodyClassName="flex justify-end">
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-brand-on-600 hover:text-brand-on-700 px-5 py-2 rounded-lg text-sm font-semibold"
          >
            Save Appearance
          </button>
        </PageSection>
      </form>
    </PageShell>
  );
}
