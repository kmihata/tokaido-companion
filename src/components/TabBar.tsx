import type { ReactNode } from 'react';
import { href } from '../router';
import type { RouteName } from '../router';

/**
 * Five tabs, not six.
 *
 * The suggested information architecture was Today / Map / Day / Places /
 * Capture / Offline+Settings. Two changes, argued in ARCHITECTURE.md:
 *
 *  - "Decide" gets a tab. The stated central field problem is the
 *    continue-or-stop decision; burying the calculator behind Today would put
 *    the most consequential screen at the greatest tap depth.
 *  - "Day" and "Places" move under "More". On a walking day, Today already IS
 *    the day card; a separate Day tab duplicates it. Places is a browse
 *    surface, and browsing is a planning activity.
 *
 * Five targets across a phone width keeps each one comfortably past 48px.
 */
const TABS: { to: string; label: string; glyph: string; matches: RouteName[] }[] = [
  { to: '/', label: 'Today', glyph: '☀', matches: ['today'] },
  { to: '/decide', label: 'Decide', glyph: '⚖', matches: ['decide'] },
  { to: '/map', label: 'Map', glyph: '🗺', matches: ['map'] },
  { to: '/capture', label: 'Capture', glyph: '✎', matches: ['capture'] },
  {
    to: '/more',
    label: 'More',
    glyph: '☰',
    matches: [
      'more',
      'days',
      'day',
      'places',
      'place',
      'route',
      'plan',
      'prepare',
      'add-place',
      'import-route',
      'section',
      'offline',
      'settings',
      'about',
    ],
  },
];

export function TabBar({ current }: { current: RouteName }): ReactNode {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) => {
        const active = t.matches.includes(current);
        return (
          <a
            key={t.to}
            className="tabbar__item"
            href={href(t.to)}
            aria-current={active ? 'page' : undefined}
            data-testid={`tab-${t.label.toLowerCase()}`}
          >
            <span className="tabbar__glyph" aria-hidden="true">
              {t.glyph}
            </span>
            <span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
