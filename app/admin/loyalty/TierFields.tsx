"use client";

import { useEffect, useRef, useState } from "react";
import { DiscountKind, type PricingTier } from "@prisma/client";
import { centsToInput, formatCents } from "@/lib/pricing";
import { EXAMPLE_LIST_CENTS, tierDiscountCents } from "@/lib/pricing-tiers-math";

const inputClass =
  "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm ";

/**
 * A rate is either a percentage or a fixed sum, never both, so only the field
 * that applies is shown — a form offering both invites a tier that says 15%
 * and $10 and means neither.
 */
export default function TierFields({ tier, idPrefix }: { tier?: PricingTier; idPrefix: string }) {
  const [kind, setKind] = useState<DiscountKind>(tier?.discountKind ?? DiscountKind.PERCENT);
  const previewRef = useRef<HTMLSpanElement>(null);

  // Live preview: recomputes with the same arithmetic the server uses
  // (lib/pricing-tiers-math.ts), so typing a percent or amount updates the
  // worked example with no round trip.
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const percent = document.getElementById(`${idPrefix}-percent`) as HTMLInputElement | null;
    const amount = document.getElementById(`${idPrefix}-amount`) as HTMLInputElement | null;

    const recompute = () => {
      const discountCents = tierDiscountCents(EXAMPLE_LIST_CENTS, {
        id: "",
        name: "",
            note: null,
            isActive: true,
                discountKind: kind,
                discountPercent: kind === DiscountKind.PERCENT ? Number(percent?.value) || 0 : null,
                    discountCents:
                    kind === DiscountKind.AMOUNT ? Math.round((Number(amount?.value) || 0) * 100) : null,
      });
      preview.textContent =
      discountCents > 0
          ? `${formatCents(EXAMPLE_LIST_CENTS)} visit \u2192 ${formatCents(EXAMPLE_LIST_CENTS - discountCents)}`
          : "No discount yet";
    };

    recompute();
    const controller = new AbortController();
    for (const field of [percent, amount]) {
      field?.addEventListener("input", recompute, { signal: controller.signal });
    }
    return () => controller.abort();
  }, [kind, idPrefix]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-sm" htmlFor={`${idPrefix}-name`}>
          <span className="block font-medium text-stone-700 mb-1">Name</span>
          <input
            id={`${idPrefix}-name`}
            name="name"
            required
            defaultValue={tier?.name ?? ""}
            placeholder="Legacy 2015"
            className={inputClass}
          />
        </label>

        <label className="text-sm" htmlFor={`${idPrefix}-kind`}>
          <span className="block font-medium text-stone-700 mb-1">Discount type</span>
          <select
            id={`${idPrefix}-kind`}
            name="discountKind"
            value={kind}
            onChange={(event) => setKind(event.target.value as DiscountKind)}
            className={inputClass}
          >
            <option value={DiscountKind.PERCENT}>Percent off</option>
            <option value={DiscountKind.AMOUNT}>Fixed amount off</option>
          </select>
        </label>

        {kind === DiscountKind.PERCENT ? (
          <label className="text-sm" htmlFor={`${idPrefix}-percent`}>
            <span className="block font-medium text-stone-700 mb-1">Percent off</span>
            <input
              id={`${idPrefix}-percent`}
              name="discountPercent"
              inputMode="decimal"
              defaultValue={tier?.discountPercent ?? ""}
              placeholder="15"
              className={inputClass}
            />
          </label>
        ) : (
          <label className="text-sm" htmlFor={`${idPrefix}-amount`}>
            <span className="block font-medium text-stone-700 mb-1">Amount off the visit</span>
            <input
              id={`${idPrefix}-amount`}
              name="discountAmount"
              inputMode="decimal"
              defaultValue={centsToInput(tier?.discountCents)}
              placeholder="10"
              className={inputClass}
            />
          </label>
        )}
      </div>

      <p className="text-xs text-stone-500" aria-live="polite">
        <span ref={previewRef} />
      </p>

      <label className="text-sm block" htmlFor={`${idPrefix}-note`}>
        <span className="block font-medium text-stone-700 mb-1">Why this rate exists</span>
        <input
          id={`${idPrefix}-note`}
          name="note"
          defaultValue={tier?.note ?? ""}
          placeholder="Customers from before the 2016 price rise. Agreed with Dana."
          className={inputClass}
        />
        <span className="block text-xs text-stone-400 mt-1">
          Shown to staff on the customer&apos;s profile, so whoever is at the counter knows why the
          price is different.
        </span>
      </label>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={tier?.isActive ?? true}
            className="h-4 w-4 accent-amber-700"
          />
          <span className="text-stone-700">
            In use
            <span className="block text-xs text-stone-400">
              Switch off to charge list prices again without unassigning anyone.
            </span>
          </span>
        </label>

        <label className="text-sm ml-auto" htmlFor={`${idPrefix}-sort`}>
          <span className="block font-medium text-stone-700 mb-1">Order</span>
          <input
            id={`${idPrefix}-sort`}
            name="sortOrder"
            inputMode="numeric"
            defaultValue={tier?.sortOrder ?? 0}
            className={`${inputClass} w-20`}
          />
        </label>
      </div>
    </div>
  );
}
