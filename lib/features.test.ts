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
    featureAppointmentReminders: true,
    featureRebookingPrompts: true,
    featureCounterPayments: true,
    featureDailyDigest: true,
    featureSlotOffers: true,
    featureTestimonials: true,
    featureVoiceCalls: true,
    twilioAccountSid: "AC_test",
    twilioAuthToken: "token",
    twilioFromNumber: "+15550000000",
    ...overrides,
  };
}

describe("registry integrity", () => {
  it("declares every key exactly once", () => {
    const keys = FEATURES.map((feature) => feature.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(15);
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

  // The documents themselves are rows, so there is nothing on the config to
  // check: no active document means nothing is asked for, which is emptiness
  // rather than a dead switch.
  it("is on for documents with the column set", () => {
    expect(isEnabled(configured({}), "featureWaiverRequired")).toBe(true);
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

describe("appointment reminders", () => {
  it("is not live with no channel to send down", () => {
    const config = configured({ featureEmailNotify: false, featureSmsNotify: false });
    expect(isEnabled(config, "featureAppointmentReminders")).toBe(false);
    expect(featureBlockers(config, "featureAppointmentReminders")).toHaveLength(1);
  });

  it("is live on SMS alone", () => {
    const config = configured({ featureEmailNotify: false });
    expect(isEnabled(config, "featureAppointmentReminders")).toBe(true);
  });

  // SMS switched on without credentials is not a channel. The reminder has to
  // read the *resolved* state of its siblings, not their columns.
  it("is not live behind a half-configured channel", () => {
    const config = configured({ featureEmailNotify: false, twilioAuthToken: null });
    expect(isEnabled(config, "featureAppointmentReminders")).toBe(false);
  });
});

describe("the morning brief", () => {
  it("needs a way to send mail and nothing else", () => {
    const noMail = configured({ featureEmailNotify: false });
    expect(isEnabled(noMail, "featureDailyDigest")).toBe(false);
    // Texts do not carry it: a brief is a page of reading, not a segment.
    expect(featureBlockers(noMail, "featureDailyDigest")).toHaveLength(1);
  });
});

describe("filling a cancelled slot", () => {
  it("goes off with the rebooking list it draws its candidates from", () => {
    const config = configured({ featureRebookingPrompts: false });
    expect(isEnabled(config, "featureSlotOffers")).toBe(false);
    expect(featureBlockers(config, "featureSlotOffers")[0]).toMatch(/Rebooking Prompts/);
  });

  it("is not live with no channel to offer down", () => {
    const config = configured({ featureEmailNotify: false, featureSmsNotify: false });
    expect(isEnabled(config, "featureSlotOffers")).toBe(false);
  });
});

describe("dependents", () => {
  it("names the features that go off with one that is switched off", () => {
    expect(dependents("featureRebookingPrompts")).toEqual(["featureSlotOffers"]);
  });

  it("returns nothing for a feature nothing is built on", () => {
    expect(dependents("featureVisitPhotos")).toEqual([]);
  });
});
