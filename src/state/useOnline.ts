import { useEffect, useState } from 'react';

/**
 * Online/offline state.
 *
 * `navigator.onLine` only means "there is a network interface". It says
 * nothing about whether anything is reachable, and on a Japanese mountainside
 * it will happily report true on one bar of unusable signal. The UI wording
 * everywhere says "device reports online", not "online".
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const up = (): void => setOnline(true);
    const down = (): void => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
