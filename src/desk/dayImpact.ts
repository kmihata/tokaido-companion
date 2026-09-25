/**
 * What adopting a retrace does to the day boundaries.
 *
 * This is the question the desk tool exists to answer as much as the tracing
 * is. A retraced section measures longer than the coarse line it replaces,
 * because the coarse line cut corners. Every cutoff after it therefore moves
 * forward, and a day that finished in a town with a hotel can quietly come to
 * finish short of it — or past it. Kevin books hotels against these boundaries,
 * so a silent drift is a booking made against a number that has since changed.
 *
 * Showing the delta per day, before adopting, is what makes that a decision
 * rather than a discovery.
 */
import type { AnchorFeature, Day } from '../data/schemas';
import type { PlanningLine } from '../lib/planningLine';
import type { DayLeg, DayPlan, DayPlanDocument } from '../lib/dayPlan';
import { applyOverrides, buildDefaultDayPlans, buildLegs } from '../lib/dayPlan';

export interface DayShift {
  dayId: string;
  label: string;
  /** Kilometre the day finishes at, before and after. */
  beforeEndKm: number;
  afterEndKm: number;
  /** Length of the day itself, before and after. */
  beforeKm: number;
  afterKm: number;
  /** Where it finishes, if it finishes at a named anchor. */
  beforeAnchor: string | null;
  afterAnchor: string | null;
}

export interface DayImpact {
  shifts: DayShift[];
  /** Days whose finishing point changed to a different anchor. */
  changedEnds: DayShift[];
  /** Days whose length moved by more than this many metres. */
  movedKm: number;
  totalBeforeKm: number;
  totalAfterKm: number;
}

/** A day whose length moves less than this is not worth reporting. */
const NOTICEABLE_KM = 0.05;

function legsFor(
  line: PlanningLine,
  anchors: readonly AnchorFeature[],
  days: readonly Day[],
  doc: DayPlanDocument | null,
): DayLeg[] {
  const plans: DayPlan[] = applyOverrides(buildDefaultDayPlans(line, anchors, days), doc);
  return buildLegs(line, plans, days, anchors);
}

export function dayImpact(
  before: { line: PlanningLine; anchors: readonly AnchorFeature[] },
  after: { line: PlanningLine; anchors: readonly AnchorFeature[] },
  days: readonly Day[],
  doc: DayPlanDocument | null,
): DayImpact {
  const a = legsFor(before.line, before.anchors, days, doc);
  const b = legsFor(after.line, after.anchors, days, doc);
  const byId = new Map(b.map((l) => [l.plan.dayId, l]));

  const shifts: DayShift[] = [];
  for (const legA of a) {
    const legB = byId.get(legA.plan.dayId);
    if (!legB) continue;
    shifts.push({
      dayId: legA.plan.dayId,
      label: legA.day?.label ?? legA.plan.dayId,
      beforeEndKm: legA.endAlongKm,
      afterEndKm: legB.endAlongKm,
      beforeKm: legA.distanceKm,
      afterKm: legB.distanceKm,
      beforeAnchor: legA.endAnchorId,
      afterAnchor: legB.endAnchorId,
    });
  }

  return {
    shifts,
    changedEnds: shifts.filter((s) => s.beforeAnchor !== s.afterAnchor),
    movedKm: shifts.filter((s) => Math.abs(s.afterKm - s.beforeKm) >= NOTICEABLE_KM).length,
    totalBeforeKm: a.reduce((t, l) => t + l.distanceKm, 0),
    totalAfterKm: b.reduce((t, l) => t + l.distanceKm, 0),
  };
}
