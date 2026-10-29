import { useEffect, useMemo, useState } from 'react';
import { assetUrl } from '../lib/base';
import { placeOnLine } from '../lib/restrooms';
import type { PlacedRestroom, RestroomsFile } from '../lib/restrooms';
import type { PlanningLine } from '../lib/planningLine';

let cached: Promise<RestroomsFile> | null = null;

function loadRestrooms(): Promise<RestroomsFile> {
  cached ??= fetch(assetUrl('data/restrooms.json')).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<RestroomsFile>;
  });
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

/** The restroom list, placed on the planning line once. Empty until loaded or if it fails. */
export function usePlacedRestrooms(line: PlanningLine | null): PlacedRestroom[] {
  const [file, setFile] = useState<RestroomsFile | null>(null);
  useEffect(() => {
    let live = true;
    loadRestrooms()
      .then((f) => {
        if (live) setFile(f);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return useMemo(() => (file && line ? placeOnLine(line, file.restrooms) : []), [file, line]);
}
