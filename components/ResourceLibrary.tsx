"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import {
  countEntries,
  filterSections,
  type ResourceSection,
} from "@/lib/resources";

const STORAGE_KEY = "gentlegroomer.resource-bookmarks";
const button =
  "rounded-lg border border-well-line px-3 py-2 text-sm font-bold transition-colors hover:bg-band focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600";

export default function ResourceLibrary({
  sections,
  breedCount,
}: {
  sections: ResourceSection[];
  breedCount: number;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("library");
  const [topic, setTopic] = useState("all");
  const [saved, setSaved] = useState<string[]>([]);
  const [storageNotice, setStorageNotice] = useState("");
  const [selected, setSelected] = useState<{
    slug: string;
    term?: string;
  } | null>(null);
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "[]",
      );
      // Restore browser-only preferences after hydration.
      if (Array.isArray(value))
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSaved(
          value.filter((item): item is string => typeof item === "string"),
        );
    } catch {
      setStorageNotice("Saved references are available for this visit only.");
    }
  }, []);
  const keyFor = (slug: string, term: string) => `${slug}:${term}`;
  function toggleSaved(key: string) {
    const next = saved.includes(key)
      ? saved.filter((item) => item !== key)
      : [...saved, key];
    setSaved(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setStorageNotice(
        "Your browser could not store these references. They remain saved for this visit.",
      );
    }
  }
  const matches = useMemo(
    () =>
      filterSections(sections, query)
        .filter((section) => topic === "all" || section.slug === topic)
        .map((section) => ({
          ...section,
          entries: section.entries.filter(
            (entry) =>
              tab !== "saved" ||
              saved.includes(`${section.slug}:${entry.term}`),
          ),
        }))
        .filter((section) => section.entries.length > 0),
    [sections, query, topic, tab, saved],
  );
  const active = sections.find((section) => section.slug === selected?.slug);
  const entryIndex =
    active?.entries.findIndex((entry) => entry.term === selected?.term) ?? -1;
  const activeEntries = active
    ? entryIndex >= 0
      ? [active.entries[entryIndex]]
      : active.entries
    : [];
  const savedCount = sections.reduce(
    (total, section) =>
      total +
      section.entries.filter((entry) =>
        saved.includes(keyFor(section.slug, entry.term)),
      ).length,
    0,
  );
  function reset() {
    setQuery("");
    setTopic("all");
  }

  return (
    <div className="min-w-0 text-ink">
      <section className="grid gap-6 border-t border-well-line bg-gradient-to-br from-brand-100/40 via-surface to-band p-5 sm:p-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-text">
            The team&apos;s everyday reference
          </p>
          <h2 className="mt-3 max-w-xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            A little knowledge.
            <br />A gentler groom.
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            From the first brush to the final handover, find the details that
            help you care with confidence. Keep useful references close and make
            them part of your day.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-muted">
            <span className="rounded-full border border-well-line bg-surface px-3 py-1.5">
              {countEntries(sections)} quick references
            </span>
            <span className="rounded-full border border-well-line bg-surface px-3 py-1.5">
              {sections.length} topics
            </span>
            <span className="rounded-full border border-well-line bg-surface px-3 py-1.5">
              {breedCount} breed guides
            </span>
          </div>
        </div>
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => setSelected({ slug: "safety" })}
            className="rounded-xl border border-well-line bg-surface p-4 text-left shadow-card transition-colors hover:bg-band"
          >
            <span className="text-xs font-bold uppercase tracking-wider text-brand-text">
              Always within reach ↗
            </span>
            <span className="mt-2 block text-lg font-bold">
              Safety & incidents
            </span>
            <span className="mt-1 block text-sm text-muted">
              When a groom stops being routine. Open the reference.
            </span>
          </button>
          <Link
            href="/staff/resources/breeds"
            className="rounded-xl border border-well-line bg-surface p-4 shadow-card transition-colors hover:bg-band"
          >
            <span className="flex justify-between font-bold">
              <span>Explore the breed guide</span>
              <span aria-hidden="true">→</span>
            </span>
            <span className="mt-1 block text-sm text-muted">
              Coat characteristics, timing, and your shop&apos;s experience.
            </span>
          </Link>
        </div>
      </section>

      <div className="border-y border-well-line bg-surface px-5 sm:px-8">
        <div
          role="tablist"
          aria-label="Resource views"
          className="flex gap-5 overflow-x-auto"
        >
          {[
            ["library", "Library"],
            ["saved", `Saved (${savedCount})`],
            ["tools", "Quick tools"],
          ].map(([id, label], index, tabs) => (
            <button
              type="button"
              key={id}
              id={`resource-tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls="resource-panel"
              tabIndex={tab === id ? 0 : -1}
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight")
                  next = (index + 1) % tabs.length;
                else if (event.key === "ArrowLeft")
                  next = (index + tabs.length - 1) % tabs.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = tabs.length - 1;
                else return;
                event.preventDefault();
                setTab(tabs[next][0]);
                document
                  .getElementById(`resource-tab-${tabs[next][0]}`)
                  ?.focus();
              }}
              className={`whitespace-nowrap border-b-2 py-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600 ${tab === id ? "border-brand-600 text-brand-text" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <section
        id="resource-panel"
        role="tabpanel"
        aria-labelledby={`resource-tab-${tab}`}
        className="p-5 sm:p-8"
      >
        {tab === "tools" ? (
          <DilutionCalculator />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex-1 min-w-0">
                <span className="sr-only">Search the bench reference</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search a blade, a coat, a procedure…"
                  className="w-full rounded-xl border border-well-line bg-well px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
              </label>
              {(query || topic !== "all") && (
                <button type="button" className={button} onClick={reset}>
                  Clear filters
                </button>
              )}
            </div>
            <div
              className="mt-4 flex flex-wrap gap-2"
              aria-label="Filter by topic"
            >
              {[{ slug: "all", title: "All topics" }, ...sections].map(
                (section) => (
                  <button
                    type="button"
                    key={section.slug}
                    aria-pressed={topic === section.slug}
                    onClick={() => setTopic(section.slug)}
                    className={`${button} ${topic === section.slug ? "bg-brand-600 text-brand-on-600 hover:bg-brand-700" : "bg-surface text-muted"}`}
                  >
                    {section.title}
                  </button>
                ),
              )}
            </div>
            <div className="my-5 flex flex-wrap justify-between gap-2 text-xs text-muted">
              <p aria-live="polite">
                {countEntries(matches)} references · {matches.length} topics
              </p>
              <p>
                {tab === "saved"
                  ? "Saved in this browser for quick access."
                  : "Choose a topic to explore, or open any reference."}
              </p>
            </div>
            {storageNotice && (
              <p role="status" className="mb-4 text-sm text-muted">
                {storageNotice}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {matches.map((section) => (
                <article
                  key={section.slug}
                  className="flex flex-col overflow-hidden rounded-xl border border-well-line bg-surface shadow-card"
                >
                  <div className="border-b border-well-line bg-band p-5">
                    {/* The count, not a number in a sequence: these cards are
                        a set of topics, not steps, and "how much is in here"
                        is the thing worth knowing before opening one. */}
                    <p className="text-xs font-bold text-brand-text">
                      {section.entries.length} reference
                      {section.entries.length === 1 ? "" : "s"}
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-left text-lg font-bold hover:text-brand-text hover:underline"
                      onClick={() => setSelected({ slug: section.slug })}
                    >
                      {section.title} <span aria-hidden="true">↗</span>
                    </button>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {section.blurb}
                    </p>
                  </div>
                  <ul className="flex-1 divide-y divide-well-line px-4">
                    {section.entries.map((entry) => {
                      const isSaved = saved.includes(
                        keyFor(section.slug, entry.term),
                      );
                      return (
                        <li
                          key={entry.term}
                          className="flex items-center gap-2 py-1"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setSelected({
                                slug: section.slug,
                                term: entry.term,
                              })
                            }
                            className="min-w-0 flex-1 rounded-lg px-1 py-3 text-left hover:bg-band"
                          >
                            <span className="block text-sm font-semibold">
                              {entry.term}
                            </span>
                            {entry.note && (
                              <span className="mt-1 block text-xs text-muted">
                                {entry.note}
                              </span>
                            )}
                          </button>
                          <button
                            type="button"
                            aria-label={`${isSaved ? "Unsave" : "Save"} ${entry.term}`}
                            aria-pressed={isSaved}
                            onClick={() =>
                              toggleSaved(keyFor(section.slug, entry.term))
                            }
                            className="rounded-lg p-3 text-lg text-brand-text hover:bg-band"
                          >
                            {isSaved ? "★" : "☆"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
            {matches.length === 0 && (
              <div className="rounded-xl border border-dashed border-well-line bg-well p-8 text-center">
                <h3 className="font-bold">
                  {tab === "saved" && savedCount === 0
                    ? "Your go-to references, in one place"
                    : "No references found"}
                </h3>
                <p className="mt-2 text-sm text-muted">
                  {tab === "saved" && savedCount === 0
                    ? "Use the star beside a reference to save it here."
                    : "Try a different term or clear your topic filter."}
                </p>
                <button
                  type="button"
                  className={`${button} mt-4`}
                  onClick={() => {
                    reset();
                    setTab("library");
                  }}
                >
                  Browse all resources
                </button>
              </div>
            )}
            {query.trim() && (
              <Link
                href={`/staff/resources/breeds?q=${encodeURIComponent(query.trim())}`}
                className="mt-5 inline-block text-sm font-bold text-brand-text hover:underline"
              >
                Search “{query.trim()}” in the breed guide →
              </Link>
            )}
          </>
        )}
      </section>
      <p className="border-t border-well-line px-5 py-4 text-xs leading-relaxed text-muted sm:px-8">
        Guidance, not instruction. The pet&apos;s own notes, the owner&apos;s
        wishes, product instructions, and veterinary advice come first.
      </p>
      <Modal
        open={!!active}
        onClose={() => setSelected(null)}
        labelledBy="resource-reader-title"
        className="max-w-2xl !bg-surface text-ink"
      >
        {active && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-text">
                  {active.title}
                </p>
                <h2
                  id="resource-reader-title"
                  className="mt-2 text-2xl font-bold"
                >
                  {entryIndex >= 0
                    ? active.entries[entryIndex].term
                    : active.title}
                </h2>
              </div>
              <button
                type="button"
                className={button}
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {active.blurb}
            </p>
            {active.caution && (
              <p className="mt-4 rounded-lg border border-well-line bg-band p-4 text-sm leading-relaxed">
                <strong>Keep in mind: </strong>
                {active.caution}
              </p>
            )}
            <div className="mt-5 space-y-5">
              {activeEntries.map((entry) => (
                <article key={entry.term}>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-bold">{entry.term}</h3>
                    <button
                      type="button"
                      className={button}
                      aria-pressed={saved.includes(
                        keyFor(active.slug, entry.term),
                      )}
                      onClick={() =>
                        toggleSaved(keyFor(active.slug, entry.term))
                      }
                    >
                      {saved.includes(keyFor(active.slug, entry.term))
                        ? "★ Saved"
                        : "☆ Save"}
                    </button>
                  </div>
                  {entry.note && (
                    <p className="mt-1 font-semibold text-brand-text">
                      {entry.note}
                    </p>
                  )}
                  <p className="mt-2 text-sm leading-7 text-muted">
                    {entry.detail}
                  </p>
                </article>
              ))}
            </div>
            {entryIndex >= 0 && (
              <div className="mt-6 flex items-center justify-between gap-2 border-t border-well-line pt-4">
                <button
                  type="button"
                  className={button}
                  onClick={() => setSelected({ slug: active.slug })}
                >
                  Full topic
                </button>
                <span className="text-xs text-muted">
                  {entryIndex + 1} / {active.entries.length}
                </span>
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    setSelected({
                      slug: active.slug,
                      term: active.entries[
                        (entryIndex + 1) % active.entries.length
                      ].term,
                    })
                  }
                >
                  Next reference →
                </button>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

function DilutionCalculator() {
  const [ratio, setRatio] = useState("16");
  const [volume, setVolume] = useState("500");
  const r = Number(ratio),
    v = Number(volume);
  const valid =
    ratio.trim() !== "" &&
    Number.isFinite(r) &&
    r > 0 &&
    Number.isFinite(v) &&
    v > 0;
  const format = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-brand-text">
          Less mental math, more care
        </p>
        <h2 className="mt-2 text-2xl font-bold">Dilution calculator</h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
          Work out a bottle mix using the ratio on your product label. Here,
          16:1 means 16 parts water to 1 part concentrate.
        </p>
        <p className="mt-4 rounded-xl border border-well-line bg-band p-4 text-sm text-muted">
          Check the manufacturer&apos;s ratio convention and mixing instructions
          first. This tool calculates quantities; it does not recommend a
          dilution.
        </p>
      </div>
      <div className="rounded-xl border border-well-line bg-well p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold">
            Water parts per 1 concentrate
            <input
              type="number"
              min="0.1"
              step="any"
              value={ratio}
              onChange={(event) => setRatio(event.target.value)}
              className="mt-2 w-full rounded-lg border border-well-line bg-surface p-3 text-ink"
            />
          </label>
          <label className="text-sm font-bold">
            Total mixture (mL)
            <input
              type="number"
              min="1"
              step="any"
              value={volume}
              onChange={(event) => setVolume(event.target.value)}
              className="mt-2 w-full rounded-lg border border-well-line bg-surface p-3 text-ink"
            />
          </label>
        </div>
        <div aria-live="polite" className="mt-5 border-t border-well-line pt-5">
          {valid ? (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-muted">Concentrate</dt>
                <dd className="mt-1 text-2xl font-bold text-brand-text">
                  {format(v / (r + 1))} mL
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Water</dt>
                <dd className="mt-1 text-2xl font-bold">
                  {format(v * (r / (r + 1)))} mL
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted">
              Enter a positive ratio and total volume to calculate your mix.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
