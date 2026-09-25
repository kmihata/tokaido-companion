/**
 * Base-path helpers.
 *
 * The production target is a GitHub Pages *project* site served from a
 * subpath, so nothing in this app may construct an absolute URL beginning
 * with "/". Everything goes through here.
 *
 * `import.meta.env.BASE_URL` is injected by Vite from the `base` option and
 * always ends with "/".
 */

export const BASE_URL: string = import.meta.env.BASE_URL || '/';

/** Resolve a bundled asset path, e.g. assetUrl('data/days.json'). */
export function assetUrl(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '');
  return `${BASE_URL}${clean}`;
}

/** Absolute URL for the current deployment, for share text and diagnostics. */
export function appOrigin(): string {
  if (typeof window === 'undefined') return BASE_URL;
  return new URL(BASE_URL, window.location.href).href;
}
