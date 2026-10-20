import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from './AppState';

/**
 * One GPS fix on demand, for the "Where am I?" button.
 *
 * Not a track. It runs only after a tap and stops itself. Phones often answer
 * first with a coarse position from WiFi or cell towers, so it keeps listening
 * for a short while and keeps the best answer, stopping early once one is good
 * enough. A fix that never gets good is still returned, with its accuracy, so
 * the screen can say how far to trust it rather than pretend.
 *
 * The pretend position in Settings wins outright, exactly as in
 * useGeolocation, and is reported as such.
 */

/** Stop listening once a fix is at least this good, metres. */
export const GOOD_ENOUGH_ACCURACY_M = 50;
/** Give up waiting for a better fix after this long, ms. */
export const FIX_WINDOW_MS = 15_000;

export interface LocationFix {
  lat: number;
  lon: number;
  accuracyM: number | null;
  at: number;
  pretend: boolean;
}

export interface LocationFixState {
  status: 'idle' | 'locating' | 'done' | 'error';
  fix: LocationFix | null;
  error: string | null;
}

export function useLocationFix(onFix?: (fix: LocationFix) => void): LocationFixState & {
  locate: () => void;
} {
  const { settings } = useAppState();
  const override = settings.positionOverride;
  const [state, setState] = useState<LocationFixState>({ status: 'idle', fix: null, error: null });
  const watchId = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const best = useRef<GeolocationPosition | null>(null);
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  const clear = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const finish = useCallback(
    (pos: GeolocationPosition) => {
      clear();
      const fix: LocationFix = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        at: Date.now(),
        pretend: false,
      };
      setState({ status: 'done', fix, error: null });
      onFixRef.current?.(fix);
    },
    [clear],
  );

  const locate = useCallback(() => {
    clear();
    best.current = null;

    if (override) {
      const fix: LocationFix = { lat: override.lat, lon: override.lon, accuracyM: null, at: Date.now(), pretend: true };
      setState({ status: 'done', fix, error: null });
      onFixRef.current?.(fix);
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((s) => ({ ...s, status: 'error', error: 'This browser has no location service.' }));
      return;
    }

    setState((s) => ({ ...s, status: 'locating', error: null }));

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best.current || pos.coords.accuracy < best.current.coords.accuracy) best.current = pos;
        if (pos.coords.accuracy <= GOOD_ENOUGH_ACCURACY_M) finish(pos);
      },
      (err) => {
        // Keep waiting if a usable fix already arrived; the timer returns it.
        if (best.current) return;
        clear();
        setState((s) => ({
          ...s,
          status: 'error',
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission is off for Samwise. Turn it on in the phone’s Settings to use this.'
              : 'No GPS fix. Try again in the open, away from tall buildings.',
        }));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: FIX_WINDOW_MS },
    );

    timer.current = setTimeout(() => {
      if (best.current) {
        finish(best.current);
      } else {
        clear();
        setState((s) => ({
          ...s,
          status: 'error',
          error: 'No GPS fix after 15 seconds. Try again in the open, away from tall buildings.',
        }));
      }
    }, FIX_WINDOW_MS);
  }, [clear, finish, override]);

  return { ...state, locate };
}
