import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAppState } from '../state/AppState';
import { DemoBanner } from '../components/DemoBanner';
import { Metric } from '../components/Metric';
import { OVER_LONG_KM, anchorAlongKm, anchorsBetween, planTotals } from '../lib/dayPlan';
import type { DayLeg } from '../lib/dayPlan';
import { formatDayLabel, formatKmMi } from '../lib/time';
import { href } from '../router';
import {
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
} from '../state/dayPlanStore';
import type { PlanSnapshot } from '../state/dayPlanStore';

/**
 * The day-balancing loop.
 *
 * Building the route and deciding where the days break are separate jobs. The
 * route is finished first; this screen is the second job, and it is iterative
 * by nature — set day 5, run day 6, find it too long, push kilometres back into
 * 5. So every control here shows what a move does to BOTH affected days before
 * it is made.
 *
 * Endpoints step between named anchors rather than being dragged. That is
 * precise, one-handed, and survives a later geometry repair upstream.
 */
export function PlanScreen(): ReactNode {
  const { dataset, plan } = useAppState();
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const totals = useMemo(() => planTotals(plan.legs), [plan.legs]);

  if (!dataset || !plan.line) return <p>Loading…</p>;
  const line = plan.line;

  return (
    <>
      <a className="backlink" href={href('/more')}>
        ← More
      </a>
      <DemoBanner inline />
      <h1>Plan the days</h1>
      <p className="muted small">
        Where each walking day ends. Distances are measured on the imported route, not taken from
        the draft schedule. Moving an endpoint changes exactly two days.
      </p>

      <section className={totals.overLongCount > 0 ? 'card card--warn' : 'card card--ok'}>
        <div className="card__label">Current plan</div>
        <div className="metrics">
          <Metric label="Total" value={formatKmMi(totals.totalKm)} testId="plan-total" />
          <Metric label="Mean day" value={formatKmMi(totals.meanKm)} testId="plan-mean" />
          <Metric
            label="Longest"
            value={formatKmMi(totals.longest?.distanceKm ?? null)}
            note={totals.longest ? `day ${totals.longest.plan.walkingDayNumber}` : undefined}
          />
          <Metric
            label={`Days over ${OVER_LONG_KM} km`}
            value={totals.overLongCount}
            note={totals.overLongCount > 0 ? 'too long to plan for' : 'none'}
            testId="plan-overlong"
          />
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          Plus roughly {dataset.routeMeta.totals.missingKyotoApproachKmEstimate} km still missing
          into Kyoto, which will land on the last day.
        </p>
        {plan.document && Object.keys(plan.document.overrides).length > 0 ? (
          <div className="btnrow" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                if (!window.confirm('Reset every day boundary to the default?')) return;
                void plan.resetAll().then(() => setMessage('All boundaries reset to the default.'));
              }}
            >
              Reset all to default
            </button>
          </div>
        ) : null}
      </section>

      {message ? (
        <p className="small" role="status" data-testid="plan-message">
          {message}
        </p>
      ) : null}

      <ul className="list" data-testid="plan-days">
        {plan.legs.map((leg, i) => {
          const open = openDayId === leg.plan.dayId;
          const long = leg.distanceKm > OVER_LONG_KM;
          const moved = plan.isOverridden(leg.plan.dayId);
          const endName =
            plan.anchors.find((a) => a.properties.id === leg.endAnchorId)?.properties.title ??
            `${leg.endAlongKm.toFixed(1)} km along the route`;

          return (
            <li key={leg.plan.dayId}>
              <div
                className="list__item"
                style={long ? { borderColor: 'var(--stop)', borderWidth: 2 } : undefined}
              >
                <button
                  type="button"
                  onClick={() => setOpenDayId(open ? null : leg.plan.dayId)}
                  aria-expanded={open}
                  data-testid={`plan-day-${leg.plan.walkingDayNumber}`}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    display: 'block',
                    width: '100%',
                    minHeight: 44,
                  }}
                >
                  <h3>
                    Day {leg.plan.walkingDayNumber} — {formatKmMi(leg.distanceKm)}
                    {long ? ' ⚠' : ''}
                  </h3>
                  <div className="list__meta">
                    ends {endName}
                    {leg.day ? ` · ${formatDayLabel(new Date(`${leg.day.date}T12:00:00+09:00`))}` : ''}
                    {moved ? ' · moved' : ''}
                  </div>
                  <div className="list__meta">
                    cumulative {leg.cumulativeKm.toFixed(1)} km
                    {leg.deltaKm !== null
                      ? ` · draft ${leg.draftKm!.toFixed(1)} km (${leg.deltaKm >= 0 ? '+' : ''}${leg.deltaKm.toFixed(1)})`
                      : ''}
                    {leg.continuation
                      ? ` · continue +${leg.continuation.extraKm.toFixed(1)} km`
                      : ''}
                  </div>
                </button>

                {open ? (
                  <DayControls
                    leg={leg}
                    nextLeg={plan.legs[i + 1] ?? null}
                    onMessage={setMessage}
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <SnapshotPanel onMessage={setMessage} />

      <section className="card">
        <div className="card__label">Why the numbers differ from the draft</div>
        <p className="small">
          {`DAILY-SCHEDULE-DRAFT.md balances against the traditional ${dataset.trip.nominalHistoricalKm} km post-station table. The walked line measures ${line.lengthKm.toFixed(0)} km — and that is a floor, because the source samples at roughly 100 m and cuts corners. Hotel access mileage is on top of both.`}
        </p>
      </section>
    </>
  );
}

function DayControls({
  leg,
  nextLeg,
  onMessage,
}: {
  leg: DayLeg;
  nextLeg: DayLeg | null;
  onMessage: (s: string) => void;
}): ReactNode {
  const { dataset, plan } = useAppState();
  const line = plan.line;

  const candidates = useMemo(() => {
    if (!line) return [];
    // Endpoints must stay between the previous day's finish and the next
    // day's finish, so the day order can never invert.
    const upper = nextLeg ? nextLeg.endAlongKm : line.lengthKm;
    return anchorsBetween(line, plan.anchors, leg.startAlongKm, upper);
  }, [plan.anchors, line, leg.startAlongKm, nextLeg]);

  if (!dataset || !line) return null;
  const isLast = nextLeg === null;

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
      {isLast ? (
        <p className="small muted">
          The last day ends where the route ends. Move day {leg.plan.walkingDayNumber - 1} instead.
        </p>
      ) : (
        <div className="field">
          <label htmlFor={`end-${leg.plan.dayId}`}>Move this day&rsquo;s finish</label>
          <select
            id={`end-${leg.plan.dayId}`}
            data-testid={`plan-move-${leg.plan.walkingDayNumber}`}
            value={leg.endAnchorId ?? ''}
            onChange={(e) => {
              const anchor = plan.anchors.find((a) => a.properties.id === e.target.value);
              if (!anchor) return;
              const km = anchorAlongKm(line, plan.anchors, anchor.properties.id);
              if (km === null) {
                onMessage('That anchor is not on the active route.');
                return;
              }
              void plan.moveEnd(leg.plan.dayId, km, anchor.properties.id).then((err) => {
                onMessage(
                  err ?? `Day ${leg.plan.walkingDayNumber} now finishes at ${anchor.properties.title}.`,
                );
              });
            }}
          >
            {leg.endAnchorId ? null : <option value="">{leg.endAlongKm.toFixed(1)} km (no anchor)</option>}
            {candidates.map(({ anchor, alongKm }) => {
              const thisDay = alongKm - leg.startAlongKm;
              const nextDay = nextLeg ? nextLeg.endAlongKm - alongKm : null;
              return (
                <option key={anchor.properties.id} value={anchor.properties.id}>
                  {anchor.properties.title} → D{leg.plan.walkingDayNumber} {thisDay.toFixed(1)} km
                  {nextDay !== null ? `, D${leg.plan.walkingDayNumber + 1} ${nextDay.toFixed(1)} km` : ''}
                </option>
              );
            })}
          </select>
          <p className="field__hint">
            Each option shows what it does to this day and the next one before you choose it.
            {candidates.length === 0 ? ' No named point falls inside this range — use the nudges below.' : ''}
          </p>

          <div className="btnrow" data-testid={`plan-nudge-${leg.plan.walkingDayNumber}`}>
            {[-5, -1, 1, 5].map((delta) => (
              <button
                key={delta}
                type="button"
                className="btn"
                onClick={() => {
                  // A raw distance, deliberately with no anchor: this is a point
                  // on the road, not a place with a name. Add a place first if
                  // you want it to survive a route repair upstream.
                  void plan
                    .moveEnd(leg.plan.dayId, leg.endAlongKm + delta, null)
                    .then((err) =>
                      onMessage(
                        err ??
                          `Day ${leg.plan.walkingDayNumber} finish moved ${delta > 0 ? 'on' : 'back'} ${Math.abs(delta)} km.`,
                      ),
                    );
                }}
              >
                {delta > 0 ? `+${delta}` : delta} km
              </button>
            ))}
          </div>
          <p className="field__hint">
            Nudging sets a bare distance. It survives fine, but a repair to the route upstream will
            shift it — <a href={href('/add')}>add a place</a> and finish there instead if it is
            somewhere real.
          </p>
        </div>
      )}

      <div className="field">
        <label htmlFor={`cont-${leg.plan.dayId}`}>Prepared continuation beyond the finish</label>
        <select
          id={`cont-${leg.plan.dayId}`}
          value={leg.plan.continueToAnchorId ?? ''}
          onChange={(e) => {
            const id = e.target.value;
            if (!id) {
              void plan.setContinuation(leg.plan.dayId, null, null).then(() =>
                onMessage('Continuation cleared.'),
              );
              return;
            }
            const anchor = plan.anchors.find((a) => a.properties.id === id);
            const km = anchor ? anchorAlongKm(line, plan.anchors, id) : null;
            if (km === null) return;
            void plan
              .setContinuation(leg.plan.dayId, km, id)
              .then(() => onMessage(`Continuation set to ${anchor!.properties.title}.`));
          }}
        >
          <option value="">None</option>
          {anchorsBetween(line, plan.anchors, leg.endAlongKm, Math.min(line.lengthKm, leg.endAlongKm + 25)).map(
            ({ anchor, alongKm }) => (
              <option key={anchor.properties.id} value={anchor.properties.id}>
                {anchor.properties.title} — +{(alongKm - leg.endAlongKm).toFixed(1)} km
              </option>
            ),
          )}
        </select>
        <p className="field__hint">
          The continuation route starts a few kilometres before the planned finish, so switching to
          it in the field is one tap rather than a decision.
        </p>
      </div>

      <div className="btnrow">
        <a className="btn btn--primary" href={href(`/prepare/${leg.plan.dayId}`)}>
          Prepare this day
        </a>
        <a className="btn" href={href('/add')}>
          Add a finish point
        </a>
        {plan.isOverridden(leg.plan.dayId) ? (
          <button
            type="button"
            className="btn"
            onClick={() =>
              void plan
                .resetDay(leg.plan.dayId)
                .then(() => onMessage(`Day ${leg.plan.walkingDayNumber} reset to the default.`))
            }
          >
            Reset to default
          </button>
        ) : null}
      </div>

      {leg.breakInside ? (
        <p className="small">
          <strong>This day spans a break in the route</strong> — {leg.breakInside.title}. The
          distance shown does not include the gap.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Planning snapshots.
 *
 * Whole-document, immutable, restorable. Deliberately not fine-grained
 * undo/redo: a snapshot is simpler to reason about, survives a reload, and is
 * what "put it back the way it was" actually needs.
 */
function SnapshotPanel({ onMessage }: { onMessage: (s: string) => void }): ReactNode {
  const { dataset, plan } = useAppState();
  const [snaps, setSnaps] = useState<PlanSnapshot[]>([]);
  const [label, setLabel] = useState('');

  useEffect(() => {
    void listSnapshots().then(setSnaps);
  }, []);

  if (!dataset) return null;

  return (
    <section className="card">
      <h2>Snapshots</h2>
      <p className="small muted">
        Save the whole plan before a round of changes, and put it back if the changes made things
        worse. Stored on this device only.
      </p>

      <div className="field">
        <label htmlFor="snap-label">Label</label>
        <input
          id="snap-label"
          type="text"
          value={label}
          placeholder="before splitting day 12"
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>

      <div className="btnrow">
        <button
          type="button"
          className="btn btn--primary"
          data-testid="snapshot-save"
          onClick={() => {
            const name = label.trim() || new Date().toISOString().slice(0, 16).replace('T', ' ');
            void saveSnapshot(name, dataset.routeMeta.dataVersion).then(() => {
              setLabel('');
              onMessage(`Snapshot "${name}" saved.`);
              void listSnapshots().then(setSnaps);
            });
          }}
        >
          Save snapshot
        </button>
      </div>

      {snaps.length === 0 ? (
        <p className="muted small">No snapshots yet.</p>
      ) : (
        <ul className="list" data-testid="snapshot-list">
          {snaps.map((s) => (
            <li key={s.id} className="list__item">
              <h3>{s.label}</h3>
              <div className="list__meta">
                {s.savedAt.slice(0, 16).replace('T', ' ')} · {Object.keys(s.document.overrides).length}{' '}
                moved {Object.keys(s.document.overrides).length === 1 ? 'day' : 'days'}
                {s.routeDataVersion !== dataset.routeMeta.dataVersion
                  ? ` · route data was ${s.routeDataVersion}`
                  : ''}
              </div>
              <div className="btnrow" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (!window.confirm(`Restore "${s.label}"? The current plan is replaced.`)) return;
                    void restoreSnapshot(s.id)
                      .then(() => plan.reload())
                      .then(() => onMessage(`Restored "${s.label}".`));
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => void deleteSnapshot(s.id).then(() => listSnapshots().then(setSnaps))}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
