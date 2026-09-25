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
  /** Optional deep links for the AI handoff. Provider-neutral; both may be blank. */
  aiLinks: { label: string; url: string }[];
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  units: 'km',
  paceKmh: null,
  safetyBufferMinutes: 45,
  dateOverride: null,
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
