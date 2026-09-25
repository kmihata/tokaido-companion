import { describe, expect, it } from 'vitest';
import {
  FINE_SPACING_M,
  STALE_EXPORT_DAYS,
  buildWorklist,
  daysOutstanding,
  emptyWork,
  isStale,
  nextStep,
  workKey,
  worklistTotals,
  acceptAsCorrect,
} from '../../src/desk/sectionWork';
import type { SectionWork } from '../../src/desk/sectionWork';
import type { SectionStats } from '../../src/lib/sectionExport';

const NOW = new Date('2026-09-13T12:00:00Z');
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function section(from: string, to: string, spacing: number): SectionStats {
  return {
    fromAnchorId: from,
    toAnchorId: to,
    fromTitle: from,
    toTitle: to,
    fromKm: 0,
    toKm: 10,
    lengthKm: 10,
    pointCount: 50,
    meanSpacingM: spacing,
    maxGapM: spacing * 3,
  };
}

function work(key: string, patch: Partial<SectionWork>): SectionWork {
  return { ...emptyWork(key), ...patch };
}

describe('daysOutstanding', () => {
  it('counts only from an export that has not come back', () => {
    const w = work('a→b', { status: 'exported', exportedAt: daysAgo(4) });
    expect(daysOutstanding(w, NOW)).toBeCloseTo(4, 1);
  });

  it('is null once the file has been imported', () => {
    const w = work('a→b', { status: 'imported', exportedAt: daysAgo(90) });
    expect(daysOutstanding(w, NOW)).toBeNull();
  });

  it('is null for a section nobody has started', () => {
    expect(daysOutstanding(emptyWork('a→b'), NOW)).toBeNull();
  });
});

describe('isStale', () => {
  it('calls out an export that has been out too long', () => {
    expect(isStale(work('a→b', { status: 'exported', exportedAt: daysAgo(STALE_EXPORT_DAYS + 1) }), NOW)).toBe(true);
  });

  it('leaves a fresh export alone', () => {
    expect(isStale(work('a→b', { status: 'exported', exportedAt: daysAgo(1) }), NOW)).toBe(false);
  });

  it('would have caught the Yoshida file', () => {
    // Exported 2026-08-24, still not back on 2026-09-13: the real case this
    // whole model exists for.
    const w = work('a→b', { status: 'exported', exportedAt: '2026-08-24T15:04:00Z' });
    expect(isStale(w, NOW)).toBe(true);
    expect(daysOutstanding(w, NOW)!).toBeGreaterThan(19);
  });
});

describe('buildWorklist', () => {
  const sections = [
    section('a', 'b', 250), // worst, untouched
    section('c', 'd', 120),
    section('e', 'f', 90),
  ];

  it('puts a stale export above a coarser section nobody has started', () => {
    const works = [work(workKey('e', 'f'), { status: 'exported', exportedAt: daysAgo(10) })];
    const rows = buildWorklist(sections, works, NOW);
    // e→f is the finest section of the three and still comes first, because a
    // file that went out and never came back is the only state that loses work.
    expect(rows[0]!.key).toBe(workKey('e', 'f'));
    expect(rows[0]!.stale).toBe(true);
  });

  it('otherwise ranks worst-first', () => {
    const rows = buildWorklist(sections, [], NOW);
    expect(rows.map((r) => r.section.meanSpacingM)).toEqual([250, 120, 90]);
  });

  it('sinks finished work to the bottom', () => {
    // Finished means the geometry says so. A 250 m section is the worst of the
    // three and would sort first; baking it to 30 m sends it to the bottom.
    const rows = buildWorklist(
      [section('a', 'b', 30), section('c', 'd', 120), section('e', 'f', 90)],
      [work(workKey('a', 'b'), { status: 'baked', spacingAfterM: 30 })],
      NOW,
    );
    expect(rows.at(-1)!.key).toBe(workKey('a', 'b'));
  });

  it('counts a spliced edit as done even when it lands just over the line', () => {
    // Ise Ohashi to Shichiri-no-watashi, 2026-09-16. Traced at 52 m and baked,
    // but spliced into variant-saya, so the shipped section between its anchors
    // came out at 60.20 m — over the 60 m threshold of the day, and 0.4 m
    // outside the tolerance around the adopted 52. Both proofs failed by
    // centimetres on a section that had gone from 123 m to 60 m.
    //
    // FINE_SPACING_M has since moved to 65 and would now catch this one on its
    // own. The case is kept because the mechanism it tests is not about Ise
    // Ohashi: a spliced edit never reproduces its file's spacing between the
    // anchors, so some section will always land just the wrong side of whatever
    // the threshold is.
    // Pinned just above whatever the threshold is, so this keeps testing the
    // mechanism rather than the number.
    const rows = buildWorklist(
      [section('a', 'b', FINE_SPACING_M + 0.2)],
      [work(workKey('a', 'b'), { status: 'baked', spacingBeforeM: 123, spacingAfterM: 52 })],
      NOW,
    );
    expect(rows[0]!.work.status).toBe('baked');
  });

  it('still refuses a claim when the section never got finer', () => {
    // The same record shape, but the route never changed: 143 m before, 143 m
    // now. This is the Mishima case, and it must stay on the list.
    const rows = buildWorklist(
      [section('a', 'b', 143)],
      [work(workKey('a', 'b'), { status: 'baked', spacingBeforeM: 143, spacingAfterM: 72 })],
      NOW,
    );
    expect(rows[0]!.work.status).not.toBe('baked');
  });

  it('will not sink a section that only CLAIMS to be baked', () => {
    // The "Mark baked" button wrote this record and nothing else — it could not
    // have done more, since baking writes the shipped route. One click moved
    // Mishima Taisha to Mishima-juku into the collapsed Done list on
    // 2026-09-13 while the route still carried the coarse line, and it was
    // found two days later in Downloads, fully traced. The claim is not
    // evidence; the 250 m still on the section is.
    const works = [work(workKey('a', 'b'), { status: 'baked' })];
    const rows = buildWorklist(sections, works, NOW);
    expect(rows[0]!.key).toBe(workKey('a', 'b'));
    expect(rows[0]!.work.status).not.toBe('baked');
  });

  it('demotes a claimed bake to the furthest state the evidence supports', () => {
    const adopted = buildWorklist(
      [section('a', 'b', 250)],
      [work(workKey('a', 'b'), { status: 'baked', spacingAfterM: 40 })],
      NOW,
    );
    // Adopted on this machine, never baked: the route is still 250 m.
    expect(adopted[0]!.work.status).toBe('adopted');

    const exported = buildWorklist(
      [section('a', 'b', 250)],
      [work(workKey('a', 'b'), { status: 'baked', exportedFilename: 'out.gpx' })],
      NOW,
    );
    expect(exported[0]!.work.status).toBe('exported');

    const nothing = buildWorklist(
      [section('a', 'b', 250)],
      [work(workKey('a', 'b'), { status: 'baked' })],
      NOW,
    );
    expect(nothing[0]!.work.status).toBe('untouched');
  });

  it('treats a section with no record as untouched rather than dropping it', () => {
    expect(buildWorklist(sections, [], NOW)).toHaveLength(3);
  });
});

describe('progress read from the data rather than the record', () => {
  it('counts a finely-sampled section as done with no stored record at all', () => {
    // This is what makes a cleared cache survivable: the geometry is the
    // evidence, so the five retraces lost on 2026-09-13 would still have shown
    // as done once they were baked in.
    const rows = buildWorklist([section('a', 'b', FINE_SPACING_M - 10)], [], NOW);
    expect(rows[0]!.work.status).toBe('baked');
  });

  it('does not overwrite a deliberate skip', () => {
    const rows = buildWorklist(
      [section('a', 'b', FINE_SPACING_M - 10)],
      [work(workKey('a', 'b'), { status: 'skipped' })],
      NOW,
    );
    expect(rows[0]!.work.status).toBe('skipped');
  });

  it('does not hide a file that is still out for tracing', () => {
    // Still coarse, so the export has genuinely not come back.
    const rows = buildWorklist(
      [section('a', 'b', FINE_SPACING_M + 80)],
      [work(workKey('a', 'b'), { status: 'exported', exportedAt: daysAgo(10) })],
      NOW,
    );
    expect(rows[0]!.work.status).toBe('exported');
    expect(rows[0]!.stale).toBe(true);
  });

  it('clears an outstanding export once the section is actually fine', () => {
    // The file came back and was baked from the command line, so the desk never
    // saw the adopt. The geometry is the proof; the record is out of date.
    const rows = buildWorklist(
      [section('a', 'b', FINE_SPACING_M - 10)],
      [work(workKey('a', 'b'), { status: 'exported', exportedAt: daysAgo(10) })],
      NOW,
    );
    expect(rows[0]!.work.status).toBe('baked');
    expect(rows[0]!.stale).toBe(false);
  });

  it('counts a section as done when the route matches what was adopted', () => {
    // Fuchu-juku to Abekawa Bridge: 78 m, because a 426 m bridge span sits
    // inside 3.4 km. It will never reach 60 m and it is finished. Without this
    // it asks to be baked for ever.
    const rows = buildWorklist(
      [section('a', 'b', 78)],
      [work(workKey('a', 'b'), { status: 'adopted', spacingAfterM: 78 })],
      NOW,
    );
    expect(rows[0]!.work.status).toBe('baked');
  });

  it('does not call it done when the route has not moved to match', () => {
    // Adopted on the device but never baked: the route still reads the old
    // coarse spacing, so the bake reminder has to stay.
    const rows = buildWorklist(
      [section('a', 'b', 148)],
      [work(workKey('a', 'b'), { status: 'adopted', spacingAfterM: 78 })],
      NOW,
    );
    expect(rows[0]!.work.status).toBe('adopted');
  });

  it('still lists a coarse section as to do', () => {
    const rows = buildWorklist([section('a', 'b', FINE_SPACING_M + 40)], [], NOW);
    expect(rows[0]!.work.status).toBe('untouched');
  });
});

describe('nextStep', () => {
  it('names the file it is waiting on', () => {
    const w = work('a→b', { status: 'exported', exportedFilename: 'section-311km.gpx' });
    expect(nextStep(w)).toContain('section-311km.gpx');
  });

  it('tells you to bake an adopted edit, because the device is not a safe home', () => {
    expect(nextStep(work('a→b', { status: 'adopted' }))).toMatch(/bake/i);
  });
});

describe('worklistTotals', () => {
  it('counts what is left rather than leaving it to be guessed', () => {
    const works = [
      // Genuinely baked: the section measures what the adopted trace measured.
      work(workKey('a', 'b'), { status: 'baked', spacingAfterM: 30 }),
      work(workKey('c', 'd'), { status: 'exported', exportedAt: daysAgo(10) }),
    ];
    const t = worklistTotals(
      buildWorklist([section('a', 'b', 30), section('c', 'd', 120), section('e', 'f', 90)], works, NOW),
    );
    expect(t).toEqual({ total: 3, outstanding: 1, stale: 1, baked: 1, remaining: 2 });
  });
});

describe('the adopted-spacing proof', () => {
  const stats = (meanSpacingM: number): SectionStats =>
    ({
      fromAnchorId: 'a',
      toAnchorId: 'b',
      fromTitle: 'A',
      toTitle: 'B',
      lengthKm: 1.91,
      pointCount: 27,
      meanSpacingM,
      maxGapM: 445,
      fromKm: 0,
      toKm: 1.91,
    }) as SectionStats;

  it('does not read a re-trace that changed nothing as proof of a bake', () => {
    // Iwatsuka: the section measures 73.4 m, a re-trace adopted over it
    // measured 76.3 m, and the two are within tolerance. The route matched the
    // adopted spacing WITHOUT carrying the adopted geometry, so the desk
    // showed baked while the edit sat unbaked in IndexedDB. An adopted edit
    // that nothing points at is how nine retraces went missing in September.
    const rows = buildWorklist(
      [stats(73.4)],
      [work(workKey('a', 'b'), { status: 'adopted', spacingBeforeM: 73.4, spacingAfterM: 76.3 })],
    );
    expect(rows[0]!.work.status).toBe('adopted');
  });

  it('still reads a real improvement as proof of a bake', () => {
    // The case the proof was written for: Fuchu-juku to Abekawa Bridge cannot
    // reach FINE_SPACING_M because a 426 m span of river bridge sits inside
    // 3.4 km. It went 134 m -> 78 m, was baked, and must not keep asking.
    const rows = buildWorklist(
      [stats(78)],
      [work(workKey('a', 'b'), { status: 'adopted', spacingBeforeM: 134, spacingAfterM: 78 })],
    );
    expect(rows[0]!.work.status).toBe('baked');
  });

  it('still works when nothing recorded where the section started', () => {
    // Records written before spacingBeforeM existed, and records that survived
    // a partial cache clear, have no starting figure to compare against. The
    // proof falls back to what it did before rather than refusing to fire.
    const rows = buildWorklist(
      [stats(78)],
      [work(workKey('a', 'b'), { status: 'adopted', spacingBeforeM: null, spacingAfterM: 78 })],
    );
    expect(rows[0]!.work.status).toBe('baked');
  });
});

describe('accepting a section as correct', () => {
  const stats = (meanSpacingM: number): SectionStats =>
    ({
      fromAnchorId: 'a',
      toAnchorId: 'b',
      fromTitle: 'A',
      toTitle: 'B',
      lengthKm: 1.91,
      pointCount: 27,
      meanSpacingM,
      maxGapM: 445,
      fromKm: 0,
      toKm: 1.91,
    }) as SectionStats;

  it('keeps a coarse section off the worklist once it is accepted', () => {
    // The Iwatsuka case: 73 m mean, but the long steps are straight road that
    // OSM has no nodes along, so no amount of tracing improves it. Without
    // this the section asks to be traced for ever.
    const rows = buildWorklist(
      [stats(73.4)],
      [work(workKey('a', 'b'), { status: 'accepted', note: 'straight road' })],
    );
    expect(rows[0]!.work.status).toBe('accepted');
  });

  it('does not let the spacing proof overwrite the decision', () => {
    // A section that is fine by measurement AND accepted stays accepted, so
    // the reason survives rather than being replaced by a bare 'baked'.
    const rows = buildWorklist(
      [stats(40)],
      [work(workKey('a', 'b'), { status: 'accepted', note: 'straight road' })],
    );
    expect(rows[0]!.work.status).toBe('accepted');
  });

  it('discards the trace that was adopted over it', () => {
    // Accepting says the shipped line stands, so the adopted figures are
    // rejected with it. `spacingAfterM` above all: leaving it behind is what
    // made Iwatsuka read as baked, since it was indistinguishable from the
    // shipped spacing and `matchesAdopted` had nothing else to go on.
    const adopted = work(workKey('a', 'b'), {
      status: 'adopted',
      importedFilename: 'Section — Iwatsuka.gpx',
      importedAt: '2026-09-21T12:00:00.000Z',
      spacingBeforeM: 73.4,
      spacingAfterM: 76.3,
    });
    const accepted = acceptAsCorrect(adopted, 'straight road');
    expect(accepted.status).toBe('accepted');
    expect(accepted.spacingAfterM).toBeNull();
    expect(accepted.importedFilename).toBeNull();
    expect(accepted.importedAt).toBeNull();
    // The starting figure stays: it is data about the section, not about the
    // trace, and it is what makes the gain readable later.
    expect(accepted.spacingBeforeM).toBe(73.4);
    expect(buildWorklist([stats(73.4)], [accepted])[0]!.work.status).toBe('accepted');
  });

  it('says why, rather than just that it is done', () => {
    // The whole reason this is not `skipped`: a status that outranks the
    // measurement is unreadable later unless it carries its reason.
    const w = work(workKey('a', 'b'), {
      status: 'accepted',
      note: 'straight road, line sits on it to 0.4 m',
    });
    expect(nextStep(w)).toContain('0.4 m');
    expect(nextStep({ ...w, status: 'skipped' })).not.toContain('0.4 m');
  });
});
