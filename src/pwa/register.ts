/**
 * Service-worker registration with an EXPLICIT update gate.
 *
 * `registerType: 'prompt'` in vite.config.ts means a new build waits rather
 * than activating. This module surfaces that wait to the UI so the running
 * version is only replaced when Kevin taps the button — never mid-walk,
 * never because a tab reloaded on a station platform.
 */
import { registerSW } from 'virtual:pwa-register';

export interface SWState {
  needRefresh: boolean;
  offlineReady: boolean;
  registered: boolean;
  error: string | null;
}

export type SWCheck = 'update-waiting' | 'up-to-date' | 'offline' | 'unsupported' | 'failed';

type Listener = (s: SWState) => void;

let state: SWState = { needRefresh: false, offlineReady: false, registered: false, error: null };
const listeners = new Set<Listener>();
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let registration: ServiceWorkerRegistration | null = null;

/**
 * An update check only runs at page load unless something asks for one, and a
 * home-screen web app on iOS is resumed rather than loaded — it can go days
 * without a page load. On 2026-10-16 a fix was deployed and the phone had no
 * way to find out. So: a check on resume and on regaining signal, throttled,
 * plus the button on the offline screen.
 */
const MIN_CHECK_INTERVAL_MS = 60_000;
let lastCheckAt = 0;

function emit(patch: Partial<SWState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export function subscribeSW(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => listeners.delete(l);
}

export function getSWState(): SWState {
  return state;
}

/** Activate the waiting service worker and reload. Only ever called from a tap. */
export async function applyPendingUpdate(): Promise<void> {
  if (!applyUpdate) return;
  await applyUpdate(true);
}

/**
 * Ask the server whether a newer build exists, and download it if so.
 *
 * Downloading is not installing. `skipWaiting` is off, so whatever this
 * fetches sits in a separate cache and the running version is untouched until
 * the update prompt is tapped. Workbox re-fetches only the files whose hash
 * changed, so a code-only build is a few hundred kilobytes, not the whole app.
 */
export async function checkForUpdate(): Promise<SWCheck> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  if (navigator.onLine === false) return 'offline';
  const reg = registration ?? (await navigator.serviceWorker.getRegistration()) ?? null;
  if (!reg) return 'unsupported';
  registration = reg;
  lastCheckAt = Date.now();
  try {
    await reg.update();
  } catch (err) {
    emit({ error: err instanceof Error ? err.message : String(err) });
    return 'failed';
  }
  // update() resolves when the check is done, which can be before the new
  // worker has finished installing. Reporting "up to date" at that moment
  // would be a lie told one second too early.
  const installing = reg.installing;
  if (installing) {
    await new Promise<void>((resolve) => {
      const settled = (): void => {
        if (installing.state === 'installing') return;
        installing.removeEventListener('statechange', settled);
        resolve();
      };
      installing.addEventListener('statechange', settled);
      settled();
    });
  }
  return reg.waiting !== null || state.needRefresh ? 'update-waiting' : 'up-to-date';
}

function maybeCheck(): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
  void checkForUpdate();
}

export function initServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    emit({ error: 'This browser has no service worker support, so nothing will work offline.' });
    return;
  }
  try {
    applyUpdate = registerSW({
      immediate: true,
      onNeedRefresh: () => emit({ needRefresh: true }),
      onOfflineReady: () => emit({ offlineReady: true, registered: true }),
      onRegisteredSW: (_url: string, reg: ServiceWorkerRegistration | undefined) => {
        registration = reg ?? null;
        lastCheckAt = Date.now();
        emit({ registered: true });
      },
      onRegisterError: (err: unknown) =>
        emit({ error: err instanceof Error ? err.message : String(err) }),
    });
  } catch (err) {
    emit({ error: err instanceof Error ? err.message : String(err) });
  }

  document.addEventListener('visibilitychange', maybeCheck);
  window.addEventListener('online', maybeCheck);
}

export function useSWStateSnapshot(): SWState {
  return state;
}
