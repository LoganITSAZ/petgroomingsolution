"use client";

import { useState, type CSSProperties } from "react";
import {
  SHOP_COLOR_FIELDS, THEME_PRESETS, applyShopColors, colorsFromTokens,
  darkTokens, themeStyle, type ThemeTokens,
} from "@/lib/themes";

export default function BrandColorField({ initialTokens, shopName }: {
  initialTokens: ThemeTokens;
  shopName: string;
}) {
  const [colors, setColors] = useState(() => colorsFromTokens(initialTokens));
  const [template, setTemplate] = useState("default");
  const [dark, setDark] = useState(false);
  const tokens = applyShopColors(initialTokens, colors);
  const preview = themeStyle(dark ? darkTokens(tokens) : tokens);
  const rgb = (name: string) => `rgb(${preview[name]})`;

  return <div className="space-y-6">
    <p className="text-sm text-stone-500">
      Customize all 13 colors used by the templates. Save changes, then select Use shop colors on Appearance to apply them.
      Button and link colors adjust for readability. Dark mode keeps your accents and uses dark backgrounds with light text.
    </p>
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="shop-color-template" className="block text-sm font-medium text-stone-700">Start from a template</label>
        <select id="shop-color-template" value={template} onChange={event => setTemplate(event.target.value)} className="mt-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm">
          {THEME_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
        </select>
      </div>
      <button type="button" onClick={() => setColors(colorsFromTokens(THEME_PRESETS.find(preset => preset.id === template)!.tokens))}
        className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-700">
        Copy template colors
      </button>
      <p className="text-xs text-stone-500">Replaces the colors below. Changes apply when you save.</p>
    </div>
    {["Accents and buttons", "Backgrounds and text"].map(group => <fieldset key={group}>
      <legend className="mb-3 text-sm font-semibold text-stone-800">{group}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {SHOP_COLOR_FIELDS.filter(field => field.group === group).map(({ key, label, hint }) => {
          const id = `shopColor.${key}`;
          return <div key={key} className="rounded-lg border border-stone-200 p-3">
            <label htmlFor={id} className="block text-sm font-medium text-stone-700">{label}</label>
            <p id={`${id}-hint`} className="mt-1 text-xs text-stone-500">{hint}</p>
            <div className="mt-2 flex items-center gap-3">
              <input type="color" aria-label={`Pick ${label.toLowerCase()} color`}
                value={/^#[0-9a-f]{6}$/i.test(colors[key]) ? colors[key] : colorsFromTokens(initialTokens)[key]}
                onChange={event => setColors(current => ({ ...current, [key]: event.target.value }))}
                className="h-9 w-14 shrink-0 rounded border border-stone-200 bg-white" />
              <input type="text" id={id} name={id} value={colors[key]} required pattern="#[0-9a-fA-F]{6}"
                aria-describedby={`${id}-hint`} spellCheck={false}
                onChange={event => setColors(current => ({ ...current, [key]: event.target.value }))}
                className="w-full min-w-0 rounded-lg border border-stone-200 px-3 py-2 text-sm" />
            </div>
          </div>;
        })}
      </div>
    </fieldset>)}
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-stone-800">Color preview</h3>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={dark} onChange={event => setDark(event.target.checked)} />
          Preview dark mode
        </label>
      </div>
      <div style={{ ...preview, backgroundColor: rgb("--page-bg"), color: rgb("--ink"), borderColor: rgb("--line") } as CSSProperties}
        className="overflow-hidden rounded-xl border">
        <p style={{ backgroundColor: rgb("--brand-700"), color: rgb("--brand-on-700") }} className="px-4 py-2 text-center text-sm">Your shop tagline</p>
        <div style={{ backgroundColor: rgb("--surface"), borderColor: rgb("--line") }} className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <span style={{ color: rgb("--brand-text") }} className="font-bold">{shopName}</span>
          <span style={{ backgroundColor: rgb("--brand-600"), color: rgb("--brand-on-600") }} className="rounded-lg px-3 py-2 text-sm font-semibold">Book Now</span>
        </div>
        <div className="p-5" style={{ backgroundImage: `radial-gradient(at top left, rgb(${preview["--brand-100"]} / 0.75), transparent 70%), radial-gradient(at bottom right, rgb(${preview["--brand-500"]} / 0.18), transparent 70%)` }}>
          <div className="rounded-xl border p-4" style={{ backgroundColor: rgb("--surface"), borderColor: rgb("--line"), boxShadow: `0 8px 20px rgb(${preview["--brand-900"]} / 0.2)` }}>
            <p className="text-lg font-bold">A fresh look for your best friend</p>
            <p style={{ color: rgb("--muted") }} className="mt-1 text-sm">Bath, cut, and style with gentle care.</p>
            <span style={{ borderColor: rgb("--brand-300") }} className="mt-3 inline-block rounded-lg border px-3 py-2 text-sm font-semibold">Check pricing</span>
          </div>
        </div>
        <div style={{ backgroundColor: rgb("--footer-bg"), color: rgb("--footer-ink") }} className="px-4 py-3 text-sm">Hours · Contact · {shopName}</div>
      </div>
    </div>
  </div>;
}
