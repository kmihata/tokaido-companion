/**
 * Offline readiness check.
 *
 * Asks the Cache Storage API, item by item, whether the things this app needs
 * in a valley with no signal are actually there. Reports what is missing
 * rather than a single green tick, because "mostly cached" is the state that
 * bites: the shell loads, and then a screen is empty.
 */
import { assetUrl } from './base';
import { DATA_FILES } from '../data/load';

export interface AssetCheck {
  label: string;
  url: string;
  cached: boolean;
  critical: boolean;
}

export interface ReadinessReport {
  serviceWorkerSupported: boolean;
  serviceWorkerControlling: boolean;
  cacheApiAvailable: boolean;
  cacheNames: string[];
  assets: AssetCheck[];
  criticalMissing: number;
  checkedAt: string;
}

function documentAssets(): { label: string; url: string }[] {
  if (typeof document === 'undefined') return [];
  const out: { label: string; url: string }[] = [];
  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((s) => {
    out.push({ label: `Script ${s.src.split('/').pop()}`, url: s.src });
  });
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((l) => {
    out.push({ label: `Stylesheet ${l.href.split('/').pop()}`, url: l.href });
  });
  return out;
}

/**
 * `ignoreSearch` matters: Workbox precaches the shell with a
 * `__WB_REVISION__` query string, so an exact match would always miss.
 *
 * Several URLs may be given for one logical asset. The shell is the case that
 * needs it: it is requested as the directory URL but precached under
 * `index.html`.
 */
async function isCached(...urls: string[]): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  for (const url of urls) {
    try {
      if (await caches.match(url, { ignoreSearch: true })) return true;
    } catch {
      /* try the next candidate */
    }
  }
  return false;
}

export async function checkOfflineReadiness(): Promise<ReadinessReport> {
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const swControlling = swSupported && Boolean(navigator.serviceWorker.controller);
  const cacheApiAvailable = typeof caches !== 'undefined';

  let cacheNames: string[] = [];
  if (cacheApiAvailable) {
    try {
      cacheNames = await caches.keys();
    } catch {
      cacheNames = [];
    }
  }

  const targets: { label: string; url: string; alternates?: string[]; critical: boolean }[] = [
    {
      label: 'App shell (index.html)',
      url: assetUrl(''),
      alternates: [assetUrl('index.html')],
      critical: true,
    },
    { label: 'Web app manifest', url: assetUrl('manifest.webmanifest'), critical: false },
    ...DATA_FILES.map((f) => ({ label: `Data — ${f.replace('data/', '')}`, url: assetUrl(f), critical: true })),
    ...documentAssets().map((a) => ({ ...a, critical: true })),
    { label: 'Icon 192', url: assetUrl('icons/icon-192.png'), critical: false },
    { label: 'Icon 512', url: assetUrl('icons/icon-512.png'), critical: false },
  ];

  const assets: AssetCheck[] = [];
  for (const t of targets) {
    const { alternates, ...rest } = t;
    assets.push({ ...rest, cached: await isCached(t.url, ...(alternates ?? [])) });
  }

  return {
    serviceWorkerSupported: swSupported,
    serviceWorkerControlling: swControlling,
    cacheApiAvailable,
    cacheNames,
    assets,
    criticalMissing: assets.filter((a) => a.critical && !a.cached).length,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Nudge everything into the cache by requesting it.
 *
 * The service worker precaches on install, so this is a belt-and-braces pass
 * for anything runtime-cached or evicted. It cannot force Safari to keep
 * anything.
 */
export async function warmCaches(): Promise<{ ok: number; failed: string[] }> {
  const urls = [assetUrl(''), ...DATA_FILES.map((f) => assetUrl(f))];
  let ok = 0;
  const failed: string[] = [];
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: 'reload' });
      if (res.ok) ok++;
      else failed.push(`${u} (HTTP ${res.status})`);
    } catch (e) {
      failed.push(`${u} (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return { ok, failed };
}
