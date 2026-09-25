import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Foreground geolocation.
 *
 * IMPORTANT AND NOT NEGOTIABLE: a browser PWA on iOS does not record a track
 * in the background. Lock the phone or switch apps and this stops. A dedicated
 * app — Apple Workout, Footpath, or similar — remains the authoritative
 * activity track for the walk. This hook exists to answer "where am I standing
 * right now", nothing more. See ARCHITECTURE.md.
 */

export interface GeoState {
  status: 'idle' | 'requesting' | 'watching' | 'error' | 'unsupported';
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  timestamp: number | null;
  error: string | null;
}

const INITIAL: GeoState = {
  status: 'idle',
  lat: null,
  lon: null,
  accuracyM: null,
  timestamp: null,
  error: null,
};

export function useGeolocation(): GeoState & { start: () => void; stop: () => void } {
  const [state, setState] = useState<GeoState>(INITIAL);
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    // Keep the last known position on screen; only the watch stops.
    setState((s) => ({ ...s, status: 'idle' }));
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ ...INITIAL, status: 'unsupported', error: 'This browser has no geolocation API.' });
      return;
    }
    setState((s) => ({ ...s, status: 'requesting', error: null }));
    watchId.current = navigator.geolocation.watchPosition(
      (pos) =>
        setState({
          status: 'watching',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          timestamp: pos.timestamp,
          error: null,
        }),
      (err) =>
        setState((s) => ({
          ...s,
          status: 'error',
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied. Enable it in Settings if you want the map to show where you are.'
              : err.message,
        })),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
  }, []);

  useEffect(() => stop, [stop]);

  return { ...state, start, stop };
}
