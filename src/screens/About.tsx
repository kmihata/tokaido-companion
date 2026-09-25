import type { ReactNode } from 'react';
import { href } from '../router';
import { useAppState } from '../state/AppState';
import { BASE_URL } from '../lib/base';

export function About(): ReactNode {
  const { dataset } = useAppState();
  return (
    <>
      <a className="backlink" href={href('/more')}>
        ← More
      </a>
      <h1>About and privacy</h1>

      <section className="card">
        <h2>What this is</h2>
        <p>
          <strong>Samwise.</strong> A one-person operational field tool for walking the Tokaido
          from Tokyo to Kyoto in October–November 2026, delivered as a website so it works on a
          phone with no app store in the way. It is not a travel guide and not a book-writing
          environment.
        </p>
        <p className="small muted">
          Named for the one who carries the load, keeps the record, and knows how far there is
          left to go — and who never once decides the quest.
        </p>
      </section>

      <section className="card card--warn">
        <h2>Current status: demonstration</h2>
        <p>
          Every route line, coordinate, distance, hazard, bailout and hotel in this build is a
          placeholder. The "route" is straight lines between approximate town placemarks. Nothing
          has been measured on a GPX or checked on the ground. Do not navigate with it.
        </p>
        <p className="small muted">
          Data version {dataset?.index.dataVersion ?? '—'}, generated {dataset?.index.generated ?? '—'}.
          Served from <span className="mono">{BASE_URL}</span>.
        </p>
      </section>

      <section className="card">
        <h2>Privacy</h2>
        <ul className="notes">
          <li>No analytics, no telemetry, no advertising, no trackers, no third-party logging.</li>
          <li>No accounts, no server, no database. There is nowhere for your data to be sent.</li>
          <li>
            Captures and imported private data live in this browser's IndexedDB on this device.
            Removing them from the device removes them entirely.
          </li>
          <li>
            The AI handoff builds text for you to copy. It makes no API call and includes private
            detail only when you tick the box, which resets every time.
          </li>
          <li>
            Map tiles are fetched from OpenStreetMap, which will see your IP address and roughly
            which tiles you looked at. Turn the map off to avoid that.
          </li>
          <li>
            External links open in your browser and are subject to the linked site's own practices.
          </li>
        </ul>
        <p className="small">
          Assume this site is publicly reachable. Nothing sensitive is in the repository, and
          nothing you enter here goes into it. PRIVACY-AND-THREAT-MODEL.md has the full reasoning.
        </p>
      </section>

      <section className="card">
        <h2>Known limitations</h2>
        <ul className="notes">
          <li>
            <strong>No background location.</strong> A browser PWA on iOS stops recording the moment
            the phone locks. Apple Workout, Footpath, or a dedicated tracker remains the
            authoritative activity track.
          </li>
          <li>
            <strong>Map tiles are not guaranteed offline.</strong> They are best-effort runtime
            cache. The route line and markers work without them.
          </li>
          <li>
            <strong>Browser storage is not permanent.</strong> iOS Safari evicts unused sites'
            storage. Export regularly.
          </li>
          <li>
            <strong>Bailout distances are straight lines.</strong> There is no routed line to measure
            walking distance on yet.
          </li>
          <li>
            <strong>Sunset is astronomical.</strong> It ignores terrain. In a valley the light goes
            earlier.
          </li>
          <li>
            <strong>No Hiroshige images.</strong> Metadata structures exist; no image is bundled or
            displayed until rights are verified for that specific reproduction.
          </li>
        </ul>
      </section>

      <section className="card">
        <h2>Attribution</h2>
        <p className="small">
          Map tiles © OpenStreetMap contributors, ODbL. Mapping by Leaflet. Schedule and route
          research from the tokaido-reset project files.
        </p>
      </section>
    </>
  );
}
