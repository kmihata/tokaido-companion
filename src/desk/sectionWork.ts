/**
 * Where each section has got to in the retracing loop.
 *
 * WHY THIS EXISTS AT ALL:
 *
 * The loop is export → trace elsewhere → import → verify → adopt → bake, and
 * until now none of it was written down. The sequence and the operator's place
 * in it lived in Kevin's head, spread across six screens of the field app. On
 * 2026-09-13 a finished retrace of Yoshida-juku to Goyu-juku was found in
 * Downloads, three weeks old, 283 points against the 65 that were still in the
 * route. It had fallen out at step three and nothing had noticed, because
 * nothing was watching.
 *
 * So this is not progress decoration. A section that was exported and never
 * came back is the failure mode, and making that state visible is the whole
 * point of the thing.
 */
import type { SectionStats } from '../lib/sectionExport';

/*
 * Deliberately NOT bumped when `accepted` was added on 2026-09-21.
 *
 * `loadSectionWork` filters on exact equality, so a bump silently discards
 * every stored record — including `spacingBeforeM` and `spacingAfterM`, which
 * two of the three done-ness proofs are built on. Adding a status value is
 * additive: existing records remain valid and simply never carry the new one.
 * Bump this only when a change would make an old record mean something wrong.
 */
export const SECTION_WORK_SCHEMA_VERSION = 1;

/**
 * How long an export may sit unanswered before it is called out.
 *
 * Long enough that a section exported this morning is not nagging by lunch,
 * short enough that three weeks is unthinkable.
 */
export const STALE_EXPORT_DAYS = 3;

export type WorkStatus =
  /** Never touched. */
  | 'untouched'
  /** Exported to trace elsewhere. The file is out there somewhere. */
  | 'exported'
  /** Traced geometry came back and passed its checks, not yet adopted. */
  | 'imported'
  /** Adopted into the working route on this machine. */
  | 'adopted'
  /** Baked into the shipped data. Done, and safe from a cleared cache. */
  | 'baked'
  /** Looked at and judged not worth tracing. */
  | 'skipped'
  /**
   * Looked at and judged already correct, whatever the spacing says.
   *
   * Distinct from `skipped`, which means the work was not worth doing. This
   * means there is no work to do: the line is where you will walk, and the
   * spacing figure is measuring the road rather than the tracing.
   *
   * Iwatsuka Station crossing to Manba Ohashi is the case it was added for.
   * It reads 73 m over 1.91 km, but 22 of its 26 steps average 30 m and the
   * four long ones — 445, 308, 292, 191 — sit on the Saya Kaido to within
   * 40 cm, because the road runs dead straight and OSM has almost no nodes
   * along it. Re-editing it in gpx.studio twice made it worse both times, to
   * 83 m and 76 m, since routing can only place points where nodes already
   * are. Nothing can improve it and nothing should try.
   *
   * Carries a reason, which `skipped` does not. A status that outranks the
   * measurement has to say why, or in six months it is indistinguishable from
   * having given up.
   */
  | 'accepted';

export interface SectionWork {
  schemaVersion: number;
  /** `${fromAnchorId}→${toAnchorId}`, stable across route edits. */
  key: string;
  status: WorkStatus;
  /** The file this section is waiting on, when it is out for tracing. */
  exportedFilename: string | null;
  exportedAt: string | null;
  importedFilename: string | null;
  importedAt: string | null;
  /** Point spacing when the work started, so the gain is visible afterwards. */
  spacingBeforeM: number | null;
  spacingAfterM: number | null;
  note: string;
  updatedAt: string;
}

export function workKey(fromAnchorId: string, toAnchorId: string): string {
  return `${fromAnchorId}→${toAnchorId}`;
}

export function emptyWork(key: string, spacingBeforeM: number | null = null): SectionWork {
  return {
    schemaVersion: SECTION_WORK_SCHEMA_VERSION,
    key,
    status: 'untouched',
    exportedFilename: null,
    exportedAt: null,
    importedFilename: null,
    importedAt: null,
    spacingBeforeM,
    spacingAfterM: null,
    note: '',
    updatedAt: new Date().toISOString(),
  };
}

/** Days since an export went out, or null if nothing is outstanding. */
export function daysOutstanding(w: SectionWork, now: Date = new Date()): number | null {
  if (w.status !== 'exported' || !w.exportedAt) return null;
  const ms = now.getTime() - new Date(w.exportedAt).getTime();
  return ms / 86_400_000;
}

export function isStale(w: SectionWork, now: Date = new Date()): boolean {
  const d = daysOutstanding(w, now);
  return d !== null && d >= STALE_EXPORT_DAYS;
}

/**
 * Point spacing at or below which a section counts as already done.
 *
 * Derived rather than remembered, and that is the point. A section this finely
 * sampled was traced by hand — nothing else produces it — so the shipped route
 * is itself the evidence, and the bookkeeping in IndexedDB never has to be
 * trusted for it. When device storage was cleared on 2026-09-13 it took five
 * adopted retraces with it; the geometry was unaffected. Progress that can be
 * read off the data cannot be lost the same way.
 */
export const FINE_SPACING_M = 65;

/*
 * Raised from 60 on 2026-09-16, on evidence rather than convenience.
 *
 * Six sections sat in the 60-65 m band, and four of them had been traced by
 * hand and baked in — Outside Kozu to Odawara at 64.2, Futagawa to Iwaya at
 * 63.4, Mishima Taisha to Mishima at 61.5, Ise Ohashi to Shichiri at 60.2.
 * Road-snapped tracing through a built-up stretch settles where it settles;
 * asking for it again because it landed four metres the wrong side of a round
 * number is the threshold second-guessing finished work.
 *
 * Ise Ohashi is the clearest case: spliced into variant-saya, so the section
 * between its anchors came out coarser than the file that made it, and it could
 * only ever be counted done through a device-local record. On a phone with no
 * such record it read TO DO permanently.
 *
 * 65 is still well under the coarsest remaining work at 134 m, and under the
 * 97 m and 111 m sections either side of the Kiso river crossings. It moves the
 * line past finished work without letting unfinished work through.
 */

export interface WorklistRow {
  section: SectionStats;
  work: SectionWork;
  key: string;
  stale: boolean;
}

/**
 * The worklist, ordered so that what needs attention is at the top.
 *
 * Outstanding exports come first regardless of how coarse the section is: a
 * file that went out and never came back is the only state here that loses
 * work, so it outranks everything, including a worse section nobody has
 * started. After that it is simply worst-first among the unfinished.
 */
export function buildWorklist(
  sections: readonly SectionStats[],
  works: readonly SectionWork[],
  now: Date = new Date(),
): WorklistRow[] {
  const byKey = new Map(works.map((w) => [w.key, w]));
  const rows = sections.map((section) => {
    const key = workKey(section.fromAnchorId, section.toAnchorId);
    const stored = byKey.get(key);

    // Two independent ways to know a section is done, because one threshold
    // cannot answer it.
    //
    // Fine spacing proves it on its own: nothing but hand-tracing produces it,
    // so a section at or below FINE_SPACING_M is finished whether or not this
    // machine has any record of the work.
    //
    // But a section is not obliged to reach 60 m. Fuchu-juku to Abekawa Bridge
    // settles at 78 m because a 426 m span of Abe river bridge sits inside
    // 3.4 km, and a bridge is a straight line. It was traced, adopted and baked,
    // and under a threshold alone it would have gone on asking to be baked for
    // ever. So: if the live route now matches the spacing recorded when the
    // trace was adopted, the edit demonstrably landed in the shipped data.
    const alreadyFine = section.meanSpacingM <= FINE_SPACING_M;
    const after = stored?.spacingAfterM ?? null;
    const beforeM = stored?.spacingBeforeM ?? null;
    const near = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(4, b * 0.15);

    // ...but only when adopting would have moved the number in the first place.
    //
    // Added 2026-09-21, after Iwatsuka Station crossing to Manba Ohashi showed
    // as baked while its adopted edit sat unbaked in IndexedDB. The section
    // measures 73.4 m; the re-trace adopted over it measured 76.3 m; the two
    // are within tolerance of each other. So the shipped route matched the
    // adopted spacing without carrying the adopted geometry, and the proof
    // said "baked" about an edit nothing had baked.
    //
    // The proof only means anything if the route would look different had the
    // edit not landed. When the adopted spacing is indistinguishable from what
    // was there before the work started, matching it demonstrates nothing —
    // the unbaked route matches equally well. That is the case a re-trace of
    // an already-fine section produces, and it will recur every time one is
    // re-opened and exported unchanged.
    const matchesAdopted =
      after !== null && near(section.meanSpacingM, after) && !(beforeM !== null && near(after, beforeM));

    // Third proof, added 2026-09-16: the section is far finer than it was when
    // the work on it started.
    //
    // Ise Ohashi to Shichiri-no-watashi needed this. It was traced at 52 m,
    // baked, and the shipped section then measured 60.20 m — because that edit
    // was SPLICED into variant-saya and five of the file's points fell outside
    // the span between its two anchors. So it missed `alreadyFine` by 0.20 m and
    // `matchesAdopted` by 0.4 m of tolerance, and a section that had gone from
    // 123 m to 60 m was reported as not done.
    //
    // `spacingBeforeM` is read off the shipped route when the record is created,
    // so this compares data against data. A section that never got its edge will
    // still measure what it measured, and stay on the list.
    //
    // 0.75 is the same ratio `scripts/audit-traced-files.mjs` uses to call a
    // file finer than the route.
    const improvedSinceStart = beforeM !== null && section.meanSpacingM <= beforeM * 0.75;

    const isDone = alreadyFine || matchesAdopted || improvedSinceStart;

    // The data outranks the record, and that includes an outstanding export.
    //
    // "Exported" used to survive, so that a file genuinely out for tracing was
    // never hidden. That was wrong: if the section now measures at or below
    // FINE_SPACING_M, the file demonstrably came back — possibly baked from the
    // command line without the desk ever seeing the adopt. Kevin's desk sat
    // showing two finished sections as "out for tracing" for exactly that
    // reason, which is the stale-bookkeeping problem deriving from the data was
    // meant to prevent in the first place.
    //
    // `skipped` is the one status the geometry cannot express: it records a
    // decision not to work a section, which stays true whether or not the
    // section happens to be fine.
    const base = stored ?? emptyWork(key, section.meanSpacingM);
    const decided = base.status === 'skipped' || base.status === 'accepted';
    const work = isDone && !decided
      ? { ...base, status: 'baked' as const }
      : demoteUnsupportedBake(base);
    return { section, work, key, stale: isStale(work, now) };
  });

  const rank = (r: WorklistRow): number => {
    if (r.stale) return 0;
    if (r.work.status === 'exported') return 1;
    if (r.work.status === 'imported') return 2;
    if (r.work.status === 'adopted') return 3;
    if (r.work.status === 'skipped' || r.work.status === 'accepted') return 5;
    if (r.work.status === 'baked') return 6;
    return 4;
  };

  return rows.sort(
    (a, b) => rank(a) - rank(b) || b.section.meanSpacingM - a.section.meanSpacingM,
  );
}

/**
 * A `baked` record the geometry does not support is not baked.
 *
 * `baked` used to be settable by hand, from a button under the instructions
 * that told you to run the bake. The button wrote the word and nothing else —
 * it could not have done more, since baking writes `public/data` and a browser
 * cannot. But `rank` sorts `baked` to the bottom, so one click moved a section
 * into the collapsed Done list while the shipped route still carried the coarse
 * line. Mishima Taisha to Mishima-juku left the worklist that way on
 * 2026-09-13; so did Rokugobashi to Hatchonawate and Futagawa to Iwaya. All
 * three were found two days later sitting in Downloads, fully traced.
 *
 * The button is gone. This handles the records it already wrote, and anything
 * that sets the status without the data behind it: fall back to the furthest
 * state the evidence actually supports, so the section reappears with its
 * "Not safe yet" card and the command that finishes the job.
 *
 * The cost is that a genuinely baked section which never reached 60 m — the
 * Abe bridge case — will ask again if IndexedDB is cleared and `spacingAfterM`
 * goes with it. A desk that asks twice for finished work is a nuisance. A desk
 * that hides unfinished work is how nine sections went missing.
 */
function demoteUnsupportedBake(w: SectionWork): SectionWork {
  if (w.status !== 'baked') return w;
  if (w.spacingAfterM !== null) return { ...w, status: 'adopted' };
  if (w.exportedFilename !== null) return { ...w, status: 'exported' };
  return { ...w, status: 'untouched' };
}

/**
 * Accept a section as correct, discarding the trace that was adopted over it.
 *
 * Accepting says the shipped line stands. Anything imported and adopted on top
 * of it is thereby rejected, so the record must stop carrying it — most of all
 * `spacingAfterM`, which is the input to `matchesAdopted`. Leaving it behind is
 * what made Iwatsuka read as baked: an adopted figure indistinguishable from
 * the shipped one, held against a section nothing had baked.
 *
 * The filename goes too. It names a file in Downloads that is now superseded,
 * and the whole point of showing that name is to tell you what still needs
 * moving somewhere safe. A superseded trace needs nothing.
 */
export function acceptAsCorrect(w: SectionWork, reason: string): SectionWork {
  return {
    ...w,
    status: 'accepted',
    note: reason.trim(),
    importedFilename: null,
    importedAt: null,
    spacingAfterM: null,
    updatedAt: new Date().toISOString(),
  };
}

/** What the operator should do next, in the imperative, for one section. */
export function nextStep(w: SectionWork): string {
  switch (w.status) {
    case 'untouched':
      return 'Export it, then trace it in gpx.studio.';
    case 'exported':
      return w.exportedFilename
        ? `Trace ${w.exportedFilename}, then bring the result back here.`
        : 'Trace the exported file, then bring the result back here.';
    case 'imported':
      return 'Check the numbers, then adopt it.';
    case 'adopted':
      return 'Bake it into the shipped data so a cleared cache cannot take it.';
    case 'baked':
      return 'Done.';
    case 'skipped':
      return 'Left alone deliberately.';
    case 'accepted':
      return w.note
        ? `Correct as it stands — ${w.note}`
        : 'Correct as it stands, whatever the spacing says.';
  }
}

/** Counts for the header, so the size of what is left is never a guess. */
export function worklistTotals(rows: readonly WorklistRow[]): {
  total: number;
  outstanding: number;
  stale: number;
  baked: number;
  remaining: number;
} {
  return {
    total: rows.length,
    outstanding: rows.filter((r) => r.work.status === 'exported').length,
    stale: rows.filter((r) => r.stale).length,
    baked: rows.filter((r) => r.work.status === 'baked').length,
    remaining: rows.filter((r) => r.work.status === 'untouched' || r.work.status === 'exported')
      .length,
  };
}
