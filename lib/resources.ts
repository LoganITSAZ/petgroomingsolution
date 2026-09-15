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
 * The tool is half the groom, and the two things that go wrong with it — a hot
 * blade and a dull one — both show up on the pet before they show up on the
 * bench.
 */
const tools: ResourceSection = {
  slug: "tools",
  title: "Clippers and shears",
  blurb:
    "What to check before a pass, and what a blade is telling you when it drags, pulls or runs hot.",
  caution:
    "Test a blade against the back of your own hand every few minutes. A blade that is uncomfortable there will burn a pet, and clipper burn looks like a rash hours later — long after the groom is paid for.",
  entries: [
    {
      term: "A blade running hot",
      note: "check every 5-10 minutes",
      detail:
        "Swap to a second blade of the same length and let the first one cool on its own. Coolant spray brings the surface down and leaves the body of the blade hot, so it is a top-up between swaps, not a substitute for one.",
    },
    {
      term: "Oiling",
      note: "a line across the teeth, every 10 minutes",
      detail:
        "Run the clipper, lay a line of oil across the cutting teeth, wipe the excess. Most blades that are called dull are dry: friction is what heats them and what drags the coat.",
    },
    {
      term: "A blade that drags or pulls",
      detail:
        "Stop and change it. Working a dull blade through a coat is how ears get nicked and how a pet learns that clippers hurt. Put it aside for sharpening rather than back in the drawer.",
    },
    {
      term: "Blade drive and tension",
      detail:
        "A clipper that rattles or loses power mid-pass usually needs a drive or a hinge looked at, not more effort. Take it out of service and tell a manager — a clipper nobody reported is the one someone picks up next.",
    },
    {
      term: "Shears",
      detail:
        "Straights for bulk, curves for the head and feet, thinners to blend a line rather than to cut one. Shears are dropped once and never cut the same again, so they live closed, on the table, tips away from the edge.",
    },
    {
      term: "A wet or dirty coat",
      detail:
        "Clippers are for a clean, dry, brushed coat. Dirt blunts a blade in one groom and a damp coat clogs it, which is where the heat and the tracking come from.",
    },
  ],
};

/**
 * Cats are not small dogs, and the difference is mostly about time: a cat that
 * has had enough gives very little warning and does not settle back down.
 */
const cats: ResourceSection = {
  slug: "cats",
  title: "Cats",
  blurb:
    "A different animal on the table, with a shorter fuse and skin that tears more easily than it looks.",
  caution:
    "A cat that has stopped tolerating the groom is finished for the day. There is no talking one round, and pushing on is how people and cats both get hurt.",
  entries: [
    {
      term: "Keep it short",
      note: "aim well under an hour",
      detail:
        "Plan the order so the parts that matter most happen first. A cat has a budget of handling in it, and spending it on a perfect finish leaves nothing for the nails.",
    },
    {
      term: "Skin tears",
      detail:
        "Feline skin is thin and moves loosely over the body. Keep it flat and taut with your free hand ahead of the blade, and never lift a mat away from the skin to cut underneath it.",
    },
    {
      term: "Matting and pelting",
      detail:
        "A matted cat is shaved, not brushed out. Explain the length to the owner before the clipper starts, and warn them the skin underneath may look pink, scurfy or thin for a week.",
    },
    {
      term: "Quiet room, quiet hands",
      detail:
        "No dryer noise if it can be avoided, no dogs in the room, and no restraint that pins. Scruffing is not handling — support the body and work with the cat facing away from the busy part of the shop.",
    },
    {
      term: "Nails and the quick",
      detail:
        "Cat nails sheathe, so press the toe gently to extend one and take only the clear hook. The pink quick sits close behind it, and a cat remembers the one you catch.",
    },
    {
      term: "Lion cut",
      detail:
        "Body shaved, head, feet and tail tip left. Leave enough coat for warmth, tell the owner it takes months to come back, and check the record for whether this cat goes outside.",
    },
  ],
};

/**
 * The dryer is where most of the time goes and where most of the heat injuries
 * come from, so it gets its own card rather than a line inside coat care.
 */
const drying: ResourceSection = {
  slug: "drying",
  title: "Drying",
  blurb:
    "Getting the water out without cooking anybody. Most of the finish is decided here, before a blade touches the coat.",
  caution:
    "No pet is left alone in front of a heated dryer, and no pet is dried in a closed box. If the room is warm, the air is enough.",
  entries: [
    {
      term: "Towel first",
      detail:
        "Every minute of towelling is three off the dryer. Squeeze rather than rub — rubbing a long coat is how you make the mats you are about to brush out.",
    },
    {
      term: "High velocity",
      detail:
        "Air, not heat, does the work. Start low and away, let the pet hear it before it reaches them, and keep the nozzle moving. Never point it at the face, the ears or the back end.",
    },
    {
      term: "Ambient air only",
      note: "flat faces, seniors, heavy, already panting",
      detail:
        "Brachycephalic breeds, older pets, anything overweight and anything that arrived stressed dry on room-temperature air, with breaks. They cannot shed heat the way a young dog can.",
    },
    {
      term: "Fluff drying",
      detail:
        "Brush against the lie of the coat with warm air on the same spot. It is the difference between a coat that scissors cleanly and one that shows every line, and it cannot be rushed at the end.",
    },
    {
      term: "Ears and between the pads",
      detail:
        "Water left behind an ear or between the toes is what the owner rings about two days later. Dry those last and check them with your hand, not by eye.",
    },
    {
      term: "Damp to the skin",
      detail:
        "A double coat can read dry on top and be wet underneath. Part it down to the skin in three places before the pet goes anywhere near a clipper.",
    },
  ],
};

/**
 * The part of the day nobody is booked for. It is here because a shop that
 * skips it finds out weeks later, from several owners at once.
 */
const between: ResourceSection = {
  slug: "between",
  title: "Between pets",
  blurb:
    "The reset after every groom, and what to do when something arrives that should not be in the building.",
  entries: [
    {
      term: "The table and the tub",
      detail:
        "Hair off, then wiped down with the shop's disinfectant and left the full contact time on the label. Wiping it straight off again is the same as not using it.",
    },
    {
      term: "Blades and tools",
      detail:
        "Brush the hair out, clean, then disinfect the blade itself — it touches skin on every pet in the shop. Oil it again afterwards, because most cleaners strip the oil straight off.",
    },
    {
      term: "Fleas found mid-groom",
      detail:
        "Contain it: finish that pet in one spot, bathe with the shop's flea shampoo if the owner agrees, and clean the table, tub and drain before the next one. Tell the owner plainly and tell a manager — the next family through the door has no idea.",
    },
    {
      term: "A rash or a raw patch",
      note: "stop and ask",
      detail:
        "Anything scaly, circular, weeping, or bald enough to look wrong gets a manager before the groom continues. Do not name it to the owner; say what you can see and that it is worth a vet's look.",
    },
    {
      term: "Kennels",
      detail:
        "Stripped, cleaned and dried between pets, not just between days. A damp kennel is where a shop's smell comes from.",
    },
    {
      term: "Hands",
      detail:
        "Between every pet, and before you touch a face or an ear. It is the cheapest thing on this page and the one most often skipped when the day is running late.",
    },
  ],
};

/**
 * Safety leads. Everything else here is a lookup — a blade number, a dilution
 * ratio — and a lookup is what the search box is for. The safety card is the
 * one somebody opens with a hurt pet in their arms, and that person is
 * scanning, not typing.
 */
export const RESOURCE_SECTIONS: ResourceSection[] = [
  safety,
  blades,
  tools,
  handling,
  cats,
  coatCare,
  drying,
  between,
  owner,
];

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
