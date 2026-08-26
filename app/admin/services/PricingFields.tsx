"use client";

import { useState } from "react";
import { PricingMode } from "@prisma/client";
import { PRICE_STEP_CENTS, formatCents } from "@/lib/pricing";

/**
 * Two ways to price a service: one base price the sizes are derived from, or
 * every size typed in by hand. The derived numbers update as the base moves so
 * the effect of a price rise is visible before saving.
 */

const inputClass =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm ";

function derive(base: number, multiplier: number): number {
  const step = PRICE_STEP_CENTS;
  return Math.max(step, Math.round((base * 100 * multiplier) / step) * step);
}

export interface PricingInitial {
  pricingMode: PricingMode;
  base: string;
  mediumMultiplier: number;
  largeMultiplier: number;
  xlMultiplier: number;
  small: string;
  medium: string;
  large: string;
  xl: string;
  flat: string;
  max: string;
}

export default function PricingFields({ initial }: { initial: PricingInitial }) {
  const [mode, setMode] = useState<PricingMode>(initial.pricingMode);
  const [base, setBase] = useState(initial.base);
  const [medium, setMedium] = useState(initial.mediumMultiplier);
  const [large, setLarge] = useState(initial.largeMultiplier);
  const [xl, setXl] = useState(initial.xlMultiplier);

  const baseValue = Number(base);
  const validBase = Number.isFinite(baseValue) && baseValue > 0;

  const preview = validBase
    ? [
        { label: "Small", cents: derive(baseValue, 1) },
        { label: "Medium", cents: derive(baseValue, medium) },
        { label: "Large", cents: derive(baseValue, large) },
        { label: "XL", cents: derive(baseValue, xl) },
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {[
          { value: PricingMode.BASE, label: "One base price" },
          { value: PricingMode.MANUAL, label: "Type each price" },
        ].map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="radio"
              name="pricingMode"
              value={option.value}
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
              className="accent-amber-700"
            />
            {option.label}
          </label>
        ))}
      </div>

      {mode === PricingMode.BASE ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-sm">
              <span className="block text-stone-500 mb-1">Base price (small)</span>
              <input
                name="basePrice"
                inputMode="decimal"
                value={base}
                onChange={(event) => setBase(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="block text-stone-500 mb-1">Medium ×</span>
              <input
                name="mediumMultiplier"
                inputMode="decimal"
                value={medium}
                onChange={(event) => setMedium(Number(event.target.value))}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="block text-stone-500 mb-1">Large ×</span>
              <input
                name="largeMultiplier"
                inputMode="decimal"
                value={large}
                onChange={(event) => setLarge(Number(event.target.value))}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="block text-stone-500 mb-1">XL ×</span>
              <input
                name="xlMultiplier"
                inputMode="decimal"
                value={xl}
                onChange={(event) => setXl(Number(event.target.value))}
                className={inputClass}
              />
            </label>
          </div>

          <div className="bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm">
            {validBase ? (
              <span className="flex flex-wrap gap-x-5 gap-y-1">
                {preview.map((row) => (
                  <span key={row.label} className="text-stone-600">
                    {row.label}{" "}
                    <span className="font-semibold text-stone-900">{formatCents(row.cents)}</span>
                  </span>
                ))}
                <span className="text-xs text-stone-400">rounded to the nearest $5</span>
              </span>
            ) : (
              <span className="text-stone-400">Enter a base price to see the size ladder.</span>
            )}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { name: "priceSmall", label: "Small", value: initial.small },
            { name: "priceMedium", label: "Medium", value: initial.medium },
            { name: "priceLarge", label: "Large", value: initial.large },
            { name: "priceXl", label: "XL", value: initial.xl },
          ].map((field) => (
            <label key={field.name} className="text-sm">
              <span className="block text-stone-500 mb-1">{field.label}</span>
              <input
                name={field.name}
                inputMode="decimal"
                defaultValue={field.value}
                placeholder="—"
                className={inputClass}
              />
            </label>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Flat price</span>
          <input
            name="priceFlat"
            inputMode="decimal"
            defaultValue={initial.flat}
            className={inputClass}
          />
        </label>
        <label className="text-sm">
          <span className="block text-stone-500 mb-1">Up to (range)</span>
          <input
            name="priceMax"
            inputMode="decimal"
            defaultValue={initial.max}
            className={inputClass}
          />
        </label>
      </div>
    </div>
  );
}
