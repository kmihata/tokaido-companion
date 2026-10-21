import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { kvGet, kvSet } from '../lib/idb';
import {
  arriveByFor,
  arrivalIfStarting,
  clampMph,
  computeLeaveBy,
  DEFAULT_ALL_IN_MPH,
  defaultAccessKm,
  MPH_STEP,
  readCutoff,
} from '../lib/leaveBy';
import { formatDuration, KM_PER_MILE } from '../lib/pace';
import { formatClock, formatKmMi } from '../lib/time';

export const LEAVE_BY_KEY = 'leaveby.v1';

interface DayExtras {
  /** Hotel to route start, minutes: a train on days that do not start at the door. */
  travelMinutes: number;
  /**
   * Walking off the route at either end, km: hotel approaches. Null means use
   * the default from the private file's routeAccessKm figures.
   */
  extraKm: number | null;
}
const NO_EXTRAS: DayExtras = { travelMinutes: 0, extraKm: null };

/**
 * Night-before planning: what time to leave. See lib/leaveBy.ts.
 *
 * Everything is tapped, not typed. Pace is shared with the Decide screen's
 * "pace including stops", which is the same quantity.
 */
export function LeaveByCard({
  dayId,
  dayIso,
  routeKm,
  sunset,
}: {
  dayId: string;
  dayIso: string;
  routeKm: number;
  sunset: Date | null;
}): ReactNode {
  const { settings, updateSettings, privateData } = useAppState();
  const [all, setAll] = useState<Record<string, DayExtras>>({});

  useEffect(() => {
    void kvGet<Record<string, DayExtras>>(LEAVE_BY_KEY)
      .then((v) => setAll(v && typeof v === 'object' ? v : {}))
      .catch(() => undefined);
  }, []);

  const extras = all[dayId] ?? NO_EXTRAS;
  const setExtras = (patch: Partial<DayExtras>): void => {
    const next = { ...all, [dayId]: { ...extras, ...patch } };
    setAll(next);
    void kvSet(LEAVE_BY_KEY, next).catch(() => undefined);
  };

  const mph = clampMph(settings.paceKmh !== null ? settings.paceKmh / KM_PER_MILE : DEFAULT_ALL_IN_MPH);
  const setMph = (v: number): void => updateSettings({ paceKmh: clampMph(v) * KM_PER_MILE });

  const stay = (privateData?.lodging ?? []).find((l) => l.dayId === dayId && l.arrivalCutoff.trim() !== '');
  const cutoff = stay ? readCutoff(stay.arrivalCutoff) : null;
  const target = arriveByFor(sunset, settings.safetyBufferMinutes, cutoff, dayIso);
  const access = defaultAccessKm(privateData?.lodging ?? [], dayIso);
  const extraKm = extras.extraKm ?? access.km;
  const extraIsDefault = extras.extraKm === null;
  const distanceKm = routeKm + extraKm;

  const main = target
    ? computeLeaveBy({ distanceKm, allInMph: mph, arriveBy: target.at, travelMinutes: extras.travelMinutes })
    : null;
  const slower = [mph - MPH_STEP, mph - 2 * MPH_STEP]
    .filter((v) => v >= 1.5)
    .map((v) => ({
      mph: v,
      r: target
        ? computeLeaveBy({ distanceKm, allInMph: v, arriveBy: target.at, travelMinutes: extras.travelMinutes })
        : null,
    }));

  // "What if I start at…", in 15-minute steps from the answer.
  const [shift, setShift] = useState(0);
  useEffect(() => setShift(0), [dayId]);
  const whatIfStart = main ? new Date(main.startWalkingAt.getTime() + shift * 60_000) : null;
  const whatIfArrive = whatIfStart ? arrivalIfStarting(whatIfStart, distanceKm, mph) : null;
  const whatIfMarginMin =
    whatIfArrive && sunset ? Math.round((sunset.getTime() - whatIfArrive.getTime()) / 60_000) : null;

  const hasTravel = extras.travelMinutes > 0;

  return (
    <section className="card card--ok" data-testid="leave-by">
      <div className="card__label">{hasTravel ? 'Leave the hotel by' : 'Start walking by'}</div>
      <div className="card__big" data-testid="leave-by-time">
        {main ? formatClock(hasTravel ? main.leaveAt : main.startWalkingAt) : '—'}
      </div>
      {main && target ? (
        <p style={{ margin: '6px 0 0' }}>
          {hasTravel ? `Start walking ${formatClock(main.startWalkingAt)}, ` : ''}
          walk {formatDuration(main.walkMinutes)} with stops, arrive by {formatClock(target.at)}
          {target.reason === 'sunset'
            ? ` (${settings.safetyBufferMinutes} min before sunset at ${formatClock(sunset)}).`
            : ` (${settings.safetyBufferMinutes} min before check-in closes).`}
        </p>
      ) : (
        <p className="small">No sunset or check-in time to work back from.</p>
      )}

      {slower.some((s) => s.r) ? (
        <table className="kv" style={{ marginTop: 10 }} data-testid="leave-by-slower">
          <tbody>
            {slower.map((s) =>
              s.r ? (
                <tr key={s.mph}>
                  <th>If {s.mph.toFixed(2)} mph</th>
                  <td>
                    {hasTravel ? `leave ${formatClock(s.r.leaveAt)}, ` : ''}start {formatClock(s.r.startWalkingAt)}
                  </td>
                </tr>
              ) : null,
            )}
          </tbody>
        </table>
      ) : null}

      <Stepper
        label="Pace, stops included"
        value={`${mph.toFixed(2)} mph`}
        note={`${(mph * KM_PER_MILE).toFixed(1)} km/h · Walk 1 was 2.75`}
        onMinus={() => setMph(mph - MPH_STEP)}
        onPlus={() => setMph(mph + MPH_STEP)}
        testId="leave-by-pace"
      />
      <Stepper
        label="Getting to the start"
        value={extras.travelMinutes === 0 ? 'from the door' : formatDuration(extras.travelMinutes)}
        note="train or walk before the route begins"
        onMinus={() => setExtras({ travelMinutes: Math.max(0, extras.travelMinutes - 15) })}
        onPlus={() => setExtras({ travelMinutes: extras.travelMinutes + 15 })}
        testId="leave-by-travel"
      />
      <Stepper
        label="Extra walking off the route"
        value={`${extraKm.toFixed(1)} km`}
        note={`hotel approaches · total ${formatKmMi(distanceKm)}`}
        onMinus={() => setExtras({ extraKm: Math.max(0, Math.round((extraKm - 0.1) * 10) / 10) })}
        onPlus={() => setExtras({ extraKm: Math.round((extraKm + 0.1) * 10) / 10 })}
        testId="leave-by-extra"
      />
      <p className="small muted" style={{ margin: '2px 0 0' }} data-testid="leave-by-extra-source">
        {extraIsDefault
          ? access.parts.length > 0
            ? `From your hotel file: ${access.parts
                .map((p) => `${p.km.toFixed(2)} km ${p.when === 'morning' ? 'out from' : 'in to'} ${p.stay}`)
                .join(', ')}.`
            : 'No hotel walking distance in your hotel file for today.'
          : `Set by hand for this day.`}{' '}
        {!extraIsDefault ? (
          <button
            type="button"
            className="btn btn--small"
            onClick={() => setExtras({ extraKm: null })}
            data-testid="leave-by-extra-reset"
          >
            Use the hotel file
          </button>
        ) : null}
      </p>

      {whatIfStart && whatIfArrive ? (
        <div style={{ marginTop: 12 }} data-testid="leave-by-whatif">
          <div className="card__label">What if I start at…</div>
          <div className="btnrow" style={{ marginTop: 6, marginBottom: 4, alignItems: 'center' }}>
            <button type="button" className="btn" onClick={() => setShift(shift - 15)} aria-label="Start 15 minutes earlier">
              −15
            </button>
            <strong style={{ flex: '2 1 auto', textAlign: 'center' }}>{formatClock(whatIfStart)}</strong>
            <button type="button" className="btn" onClick={() => setShift(shift + 15)} aria-label="Start 15 minutes later">
              +15
            </button>
          </div>
          <p className="small" style={{ margin: 0 }}>
            Arrive about {formatClock(whatIfArrive)}
            {whatIfMarginMin !== null
              ? whatIfMarginMin >= 0
                ? `, ${formatDuration(whatIfMarginMin)} before sunset.`
                : `, ${formatDuration(-whatIfMarginMin)} after sunset.`
              : '.'}
          </p>
        </div>
      ) : null}

      {cutoff ? (
        <p className="small muted" style={{ marginTop: 10 }}>
          Check-in closes {cutoff.label}
          {stay ? ` at ${stay.name}` : ''}.
        </p>
      ) : null}
    </section>
  );
}

function Stepper({
  label,
  value,
  note,
  onMinus,
  onPlus,
  testId,
}: {
  label: string;
  value: string;
  note?: string;
  onMinus: () => void;
  onPlus: () => void;
  testId?: string;
}): ReactNode {
  return (
    <div style={{ marginTop: 12 }} data-testid={testId}>
      <div className="metric__k">{label}</div>
      <div className="btnrow" style={{ marginTop: 4, marginBottom: 2, alignItems: 'center' }}>
        <button type="button" className="btn" onClick={onMinus} aria-label={`${label}: less`}>
          −
        </button>
        <strong style={{ flex: '2 1 auto', textAlign: 'center' }}>{value}</strong>
        <button type="button" className="btn" onClick={onPlus} aria-label={`${label}: more`}>
          +
        </button>
      </div>
      {note ? <div className="metric__note">{note}</div> : null}
    </div>
  );
}
