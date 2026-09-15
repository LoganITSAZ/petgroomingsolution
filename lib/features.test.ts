import { describe, expect, it } from "vitest";
import {
  FEATURES,
  type FeatureConfig,
  type FeatureKey,
  dependents,
  featureBlockers,
  featuresByGroup,
  isEnabled,
} from "./features";

/** A shop with everything switched on and every precondition satisfied. */
function configured(overrides: Partial<FeatureConfig> = {}): FeatureConfig {
  return {
    featureOnlineBooking: true,
    featureWalkInPortal: true,
    featureEmailNotify: true,
    featureSmsNotify: true,
    featureWaiverRequired: true,
    featureRewards: true,
    featureVisitPhotos: true,
    featureVaccinationGate: true,
    twilioAccountSid: "AC_test",
    twilioAuthToken: "token",
    twilioFromNumber: "+15550000000",
    waiverText: "Sign here.",
    ...overrides,
  };
}

describe("registry integrity", () => {
  it("declares every key exactly once", () => {
    const keys = FEATURES.map((feature) => feature.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(8);
  });

  it("only names declared keys in requires", () => {
    const keys = new Set<FeatureKey>(FEATURES.map((feature) => feature.key));
    for (const feature of FEATURES) {
      for (const required of feature.requires ?? []) {
        expect(keys.has(required)).toBe(true);
      }
    }
  });

  it("gives every feature a label and a blurb", () => {
    for (const feature of FEATURES) {
      expect(feature.label.length).toBeGreaterThan(0);
      expect(feature.blurb.length).toBeGreaterThan(0);
    }
  });

  it("groups every feature, losing none", () => {
    const grouped = featuresByGroup().flatMap((group) => group.features);
    expect(grouped).toHaveLength(FEATURES.length);
  });
});

describe("isEnabled", () => {
  it("follows the column when everything is configured", () => {
    const config = configured();
    for (const feature of FEATURES) {
      expect(isEnabled(config, feature.key)).toBe(true);
    }
  });

  it("is false for a column that is off", () => {
    expect(isEnabled(configured({ featureRewards: false }), "featureRewards")).toBe(false);
  });

  // A shop may switch SMS on before pasting credentials. Intent is on; the
  // capability is not there, so nothing should claim it is live.
  it("is false when a precondition is missing though the column is true", () => {
    const config = configured({ twilioAuthToken: null });
    expect(config.featureSmsNotify).toBe(true);
    expect(isEnabled(config, "featureSmsNotify")).toBe(false);
  });

  it("is false for the waiver with no text to show", () => {
    expect(isEnabled(configured({ waiverText: null }), "featureWaiverRequired")).toBe(false);
  });

  it("treats whitespace-only waiver text as no waiver", () => {
    expect(isEnabled(configured({ waiverText: "   " }), "featureWaiverRequired")).toBe(false);
  });
});

describe("featureBlockers", () => {
  it("is empty for a feature that is live", () => {
    expect(featureBlockers(configured(), "featureSmsNotify")).toEqual([]);
  });

  it("names the missing configuration rather than only refusing", () => {
    const blockers = featureBlockers(configured({ twilioFromNumber: null }), "featureSmsNotify");
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toMatch(/Twilio/);
  });

  it("says nothing about a feature whose own switch is off", () => {
    // Off by choice is not a blocker — the screen shows the switch position.
    expect(featureBlockers(configured({ featureSmsNotify: false }), "featureSmsNotify")).toEqual([]);
  });
});

describe("dependents", () => {
  it("returns nothing while no feature depends on another", () => {
    for (const feature of FEATURES) {
      expect(dependents(feature.key)).toEqual([]);
    }
  });
});
