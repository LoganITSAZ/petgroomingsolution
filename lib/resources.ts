/**
 * The reference a groomer reaches for mid-shift.
 *
 * Same rule as the breed guide: **this is guidance, never instruction.** It
 * records what is widely published about tools, coats and handling so nobody
 * has to hold it in their head — it does not diagnose, and it never overrides
 * the pet's own notes, the owner's wishes, or a vet. Anything that looks
 * medical is written as "flag it to the owner", not as a treatment.
 *
 * Static on purpose. Breed guides are shop-owned and live in the database
 * because the shop learns breeds; a blade chart is the same in every shop in
 * the country, and putting it behind an admin screen would only invite it to
 * drift from the tool in someone's hand.
 */

export interface ResourceEntry {
  term: string;
  detail: string;
  /** Shown as a short qualifier beside the term — a length, a ratio, a time. */
  note?: string;
}

export interface ResourceSection {
  slug: string;
  title: string;
  blurb: string;
  /** Rendered above the entries when the section needs a word of caution. */
  caution?: string;
  entries: ResourceEntry[];
}

/**
 * Blade numbers are the one piece of shop shorthand that is genuinely
 * standardised, and the one most often mixed up under time pressure: the
 * number goes UP as the cut gets SHORTER, which is backwards from every other
 * measurement on the floor.
 */
const blades: ResourceSection = {
  slug: "blades",
  title: "Blade & comb lengths",
  blurb:
    "What each blade actually leaves behind. The number rises as the cut gets shorter — the one measurement on the floor that runs backwards.",
  caution:
    "An F blade (finish/skip-tooth pairing) leaves the same length as its plain counterpart; the teeth change how it feeds, not how short it cuts.",
  entries: [
    { term: "#3F", note: '1/2" · 13 mm', detail: "Longest common body blade. A full-coat trim that still reads as groomed." },
    { term: "#4F", note: '3/8" · 9.5 mm', detail: "The default body length on most full grooms. Forgiving on a coat with slight matting." },
    { term: "#5F", note: '1/4" · 6.3 mm', detail: "Short body clip. Where most doodle and terrier body work lands." },
    { term: "#7F", note: '1/8" · 3.2 mm', detail: "Short summer clip. Shows skin unevenness and old scarring — check the skin first." },
    { term: "#10", note: '1/16" · 1.6 mm', detail: "Sanitary, belly, under the ears, and the standard pre-bath blade on a pelted coat." },
    { term: "#15", note: "1.2 mm", detail: "Closer sanitary work and pad work on a dense-footed dog." },
    { term: "#30", note: "0.5 mm", detail: "Used under snap-on combs so the comb sets the length, not the blade." },
    { term: "#40", note: "0.25 mm", detail: "Surgical length. Skin shows through — never a finish length on a pet groom." },
    { term: "Snap-on combs", note: 'runs 1/8" to 1"+', detail: "Sit over a #30 or #40. The comb decides the length; check it is seated square before every pass or it will leave a step." },
  ],
};

const safety: ResourceSection = {
  slug: "safety",
  title: "Safety & incidents",
  blurb: "What to do the moment a groom stops being routine, and what has to be written down afterwards.",
  caution:
    "When in doubt, stop the groom. An unfinished groom is a conversation with an owner; a hurt pet or a hurt groomer is not.",
  entries: [
    {
      term: "A bite happens",
      detail:
        "Stop, secure the pet, wash the wound under running water, and tell a manager before anything else. Log a BITE visit event on the appointment — that is what sets the pet's bite history and puts the red banner on the station screen for whoever takes it next.",
    },
    {
      term: "Heat and dryers",
      detail:
        "Never leave a pet unattended in front of a heated dryer. Brachycephalic breeds, seniors, and anything overweight or already panting go on ambient air only. Kennel dryers are for moving air, not for speed.",
    },
    {
      term: "The pet is in distress",
      detail:
        "Panting that will not settle, splayed legs, collapse, vomiting, or a pet that stops fighting and goes limp. Stop, cool the room, do not offer a large drink at once, and call the owner. Escalate to a manager rather than deciding alone.",
    },
    {
      term: "A cut or a nick",
      detail:
        "Pressure first, styptic for a nail quick. Anything longer than a nick, or anything on the eyelid, ear leather or a pad, gets a manager and a call to the owner before the pet goes home. Log an INJURY event either way.",
    },
    {
      term: "A pelted or matted coat",
      detail:
        "Matting that does not lift off the skin is shaved, not brushed out — dematting a pelt is a welfare issue, not a skill test. Get the owner's agreement to the shorter length before the clipper starts, and warn them the skin underneath may look red or thin.",
    },
    {
      term: "Anything the owner should know",
      detail:
        "Lumps, hot spots, ear discharge, broken teeth, fleas, a limp, a wound under the coat. Report what you saw in plain words and never name a condition — that is a vet's job, and a guess written on a record is hard to take back.",
    },
  ],
};

const handling: ResourceSection = {
  slug: "handling",
  title: "Handling",
  blurb: "The pets that need the table set up differently before they are on it.",
  entries: [
    {
      term: "Seniors",
      detail:
        "Short sessions, sit them down for parts of it, and skip anything that needs a long stand. Arthritic hips do not like being lifted from behind. Expect the groom to run over its booked time and say so early rather than rushing the end.",
    },
    {
      term: "Puppy's first visit",
      detail:
        "Sell the experience, not the haircut. Bath, dry, nails, face tidy, and stop. A puppy that leaves unbothered comes back for ten years; one that is held down for a full groom remembers that instead.",
    },
    {
      term: "Fearful or reactive",
      detail:
        "Slow hands, no looming over the head, and no cornering. Read the pet's temperament notes before you fetch them. If a muzzle is needed it goes on calmly and comes off for breaks — and it goes in the notes for next time.",
    },
    {
      term: "Doubles from one household",
      detail:
        "Most settle better within sight of each other, which is why they share a kennel door. A pair that winds each other up is the exception — split them and note it on both records.",
    },
    {
      term: "Never left alone",
      detail:
        "A pet on a table, in a tub, or on a grooming loop is never out of arm's reach. A loop is a reminder, not a restraint, and it will not hold a dog that decides to jump.",
    },
  ],
};

const coatCare: ResourceSection = {
  slug: "coat",
  title: "Coat & bathing",
  blurb: "General starting points. The pet's own notes and the breed guide come first.",
  caution:
    "Dilution ratios vary by product — the bottle wins over anything written here.",
  entries: [
    { term: "Shampoo dilution", note: "typically 16:1 to 32:1", detail: "Concentrate straight from the bottle is wasteful and rinses badly. Mix into warm water so it carries through the coat instead of sitting on it." },
    { term: "Double coats", detail: "Never shave a healthy double coat to the skin. Bath, high-velocity dry and rake the undercoat out — the topcoat is the dog's sun and heat protection, and it may come back in patchy." },
    { term: "Curly coats", detail: "Brush and comb through BEFORE the bath. Water tightens an existing mat into a pelt, and what was twenty minutes of brushing becomes a shave-down." },
    { term: "Wire coats", detail: "Hand-stripping keeps the harsh texture and the colour; clipping softens both. Which one the owner wants is a conversation to have before the first pass, not after." },
    { term: "Rinse, then rinse again", detail: "Most skin reactions blamed on a product are residue. The coat should squeak, and the belly, armpits and between the pads are where shampoo hides." },
    { term: "Nails", detail: "Trim to just before the quick; on dark nails go a sliver at a time and watch for the grey-pink oval on the cut face. Regular small trims move the quick back — one long trim does not." },
  ],
};

const owner: ResourceSection = {
  slug: "owner",
  title: "What to tell the owner",
  blurb: "The handover at the counter is part of the groom. These are the things worth saying out loud.",
  entries: [
    { term: "Between visits", detail: "How often this coat needs brushing to stay out of trouble, and which tool. A specific answer — 'a slicker, twice a week, behind the ears and under the legs' — is the one that gets followed." },
    { term: "Booking rhythm", detail: "Say when this pet should come back and why the coat needs it, rather than leaving it to them to guess. A coat that pelts on a twelve-week cycle is a shorter cycle, not a longer groom." },
    { term: "A shorter cut than usual", detail: "Explain the matting before they see the dog, not after. Owners forgive a short coat they were warned about." },
    { term: "Anything you noticed", detail: "Describe it and point to it. 'There is a lump on the left hip, about the size of a pea — worth mentioning to your vet' is helpful. Naming it is not." },
  ],
};

/**
 * Safety leads. Everything else here is a lookup — a blade number, a dilution
 * ratio — and a lookup is what the search box is for. The safety card is the
 * one somebody opens with a hurt pet in their arms, and that person is
 * scanning, not typing.
 */
export const RESOURCE_SECTIONS: ResourceSection[] = [safety, blades, handling, coatCare, owner];

/**
 * Blade names on their own, for the groom-record box on a visit. Suggestions,
 * never a closed list — every shop keeps a tool that is not on the chart, and
 * a groomer who types "comb C" has still written down what they used.
 */
export const BLADE_TERMS: string[] = blades.entries.map((entry) => entry.term);

/** Term, qualifier and detail are all searchable — a groomer types "1/4" as readily as "blade". */
function entryHaystack(entry: ResourceEntry): string {
  return `${entry.term} ${entry.note ?? ""} ${entry.detail}`.toLowerCase();
}

/**
 * Narrow every section to the entries matching `query`, dropping the sections
 * that keep none.
 *
 * A section whose own title or blurb matches keeps all of its entries: someone
 * typing "safety" wants that card, not the three entries that happen to repeat
 * the word. Words are ANDed so a second word narrows rather than widens.
 */
export function filterSections(
  sections: ResourceSection[],
  query: string
): ResourceSection[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return sections;

  return sections.flatMap((section) => {
    const sectionHay = `${section.title} ${section.blurb}`.toLowerCase();
    if (words.every((word) => sectionHay.includes(word))) return [section];

    const entries = section.entries.filter((entry) => {
      const hay = entryHaystack(entry);
      return words.every((word) => hay.includes(word));
    });
    return entries.length > 0 ? [{ ...section, entries }] : [];
  });
}

/** Total entries across sections — what the search strip counts. */
export function countEntries(sections: ResourceSection[]): number {
  return sections.reduce((total, section) => total + section.entries.length, 0);
}
