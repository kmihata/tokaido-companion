import { kvGet, kvSet } from '../lib/idb';
import { SECTION_WORK_SCHEMA_VERSION } from './sectionWork';
import type { SectionWork } from './sectionWork';
import { serializeWrite } from '../state/writeQueue';

/**
 * Desk-side progress, on whichever machine the desk is used from.
 *
 * This is bookkeeping, not work: every state it records can be reconstructed by
 * looking at `route-sources/working/` and the shipped data. That is deliberate,
 * because device storage has already been cleared once in this project's life
 * and took five retraces with it. Nothing here is irreplaceable.
 */
export const SECTION_WORK_KEY = 'deskwork.v1';

export async function loadSectionWork(): Promise<SectionWork[]> {
  try {
    const all = await kvGet<SectionWork[]>(SECTION_WORK_KEY);
    if (!Array.isArray(all)) return [];
    return all.filter((w) => w.schemaVersion === SECTION_WORK_SCHEMA_VERSION);
  } catch {
    return [];
  }
}

export function saveSectionWork(work: SectionWork): Promise<SectionWork[]> {
  return serializeWrite(async () => {
    const all = await loadSectionWork();
    const next = all.some((w) => w.key === work.key)
      ? all.map((w) => (w.key === work.key ? work : w))
      : [...all, work];
    await kvSet(SECTION_WORK_KEY, next);
    return next;
  });
}

export function clearSectionWork(): Promise<SectionWork[]> {
  return serializeWrite(async () => {
    await kvSet(SECTION_WORK_KEY, []);
    return [];
  });
}
