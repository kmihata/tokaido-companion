import { kvGet, kvSet } from '../lib/idb';

export const SETTINGS_KEY = 'settings.v1';

export interface Settings {
  schemaVersion: 1;
  units: 'km' | 'mi';
  /** Last pace Kevin entered, km/h. Carried between screens and sessions. */
  paceKmh: number | null;
  /** Minutes of buffer subtracted from the daylight deadline. */
  safetyBufferMinutes: number;
  /**
   * Pretend it is this date, for reviewing days before the trip starts.
   * Always shown in the UI when set. Null in the field.
   */
  dateOverride: string | null;
  /**
   * Pretend the device is standing here, for rehearsing a day from home.
   *
   * The sibling of `dateOverride`, and added for the same reason. Without it
   * every screen that depends on where you are — the decision calculator, the
   * off-route distance, the next consequential point, the nearest exit — can
   * only be exercised by actually standing on the Tokaido. Tested from Seattle
   * the position is 8,000 km off route and none of those numbers mean
   * anything, which is not a rehearsal.
   *
   * Like the date override it is loud whenever it is set: a warning chip on
   * every screen, and the map dot drawn in a different colour. A pretend
   * position that looked real would be the worst thing in this app.
   */
  positionOverride: { lat: number; lon: number } | null;
  /** Optional deep links for the AI handoff. Provider-neutral; both may be blank. */
  aiLinks: { label: string; url: string }[];
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  units: 'km',
  paceKmh: null,
  safetyBufferMinutes: 45,
  dateOverride: null,
  positionOverride: null,
  aiLinks: [
    { label: 'Claude', url: 'https://claude.ai/new' },
    { label: 'ChatGPT', url: 'https://chatgpt.com/' },
  ],
};

export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await kvGet<Partial<Settings>>(SETTINGS_KEY);
    if (!stored || typeof stored !== 'object') return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...stored, schemaVersion: 1 };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await kvSet(SETTINGS_KEY, s);
}
