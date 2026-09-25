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

type Listener = (s: SWState) => void;

let state: SWState = { needRefresh: false, offlineReady: false, registered: false, error: null };
const listeners = new Set<Listener>();
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;

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
      onRegisteredSW: () => emit({ registered: true }),
      onRegisterError: (err: unknown) =>
        emit({ error: err instanceof Error ? err.message : String(err) }),
    });
  } catch (err) {
    emit({ error: err instanceof Error ? err.message : String(err) });
  }
}

export function useSWStateSnapshot(): SWState {
  return state;
}
