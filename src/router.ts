/**
 * A very small hash router.
 *
 * WHY HASH ROUTING, and why hand-written:
 *
 * The deploy target is GitHub Pages at a project subpath. Pages serves static
 * files and cannot rewrite unknown paths to index.html, so history routing
 * needs the 404.html redirect trick — which breaks the moment the app is
 * opened offline from the home screen, because there is no server to produce
 * the 404 in the first place. A hash route is resolved entirely inside a
 * document the service worker already has. Deep links survive reload, airplane
 * mode, and a rename of the repository.
 *
 * It is about sixty lines, so it is a dependency not taken rather than a
 * framework rewritten.
 */
import { useEffect, useState } from 'react';

export type RouteName =
  | 'today'
  | 'decide'
  | 'map'
  | 'capture'
  | 'more'
  | 'days'
  | 'day'
  | 'places'
  | 'place'
  | 'route'
  | 'plan'
  | 'prepare'
  | 'add-place'
  | 'import-route'
  | 'section'
  | 'adjust'
  | 'offline'
  | 'settings'
  | 'about'
  | 'not-found';

export interface Route {
  name: RouteName;
  param: string | null;
  raw: string;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const parts = raw.split('/').filter(Boolean);
  const [head, param = null] = parts;

  switch (head) {
    case undefined:
      return { name: 'today', param: null, raw };
    case 'decide':
      return { name: 'decide', param, raw };
    case 'map':
      return { name: 'map', param, raw };
    case 'capture':
      return { name: 'capture', param: null, raw };
    case 'more':
      return { name: 'more', param: null, raw };
    case 'days':
      return { name: 'days', param: null, raw };
    case 'day':
      return param ? { name: 'day', param, raw } : { name: 'days', param: null, raw };
    case 'route':
      return { name: 'route', param: null, raw };
    case 'plan':
      return { name: 'plan', param: null, raw };
    case 'prepare':
      return { name: 'prepare', param, raw };
    case 'add':
      return { name: 'add-place', param, raw };
    case 'import':
      return { name: 'import-route', param: null, raw };
    case 'section':
      return { name: 'section', param: null, raw };
    case 'adjust':
      return { name: 'adjust', param, raw };
    case 'places':
      return { name: 'places', param: null, raw };
    case 'place':
      return param ? { name: 'place', param, raw } : { name: 'places', param: null, raw };
    case 'offline':
      return { name: 'offline', param: null, raw };
    case 'settings':
      return { name: 'settings', param: null, raw };
    case 'about':
      return { name: 'about', param: null, raw };
    default:
      return { name: 'not-found', param: null, raw };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseHash(typeof window === 'undefined' ? '' : window.location.hash),
  );
  useEffect(() => {
    const onChange = (): void => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Build an href. Always relative to the current document, never absolute. */
export function href(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function navigate(path: string): void {
  window.location.hash = href(path).slice(1);
}
