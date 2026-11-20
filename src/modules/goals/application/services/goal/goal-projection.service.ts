import { measureGoal } from '../../../domain/policies/goal/goal-progress.policy.js';
import type { Goal } from '../../../domain/aggregates/goal/goal.aggregate.js';
import type { GoalLinkMeasurements } from '../../../domain/value-objects/goal/goal-link-measurements.value-object.js';
import type { GoalView } from '../../models/goal/goal-view.model.js';

/** Builds an external projection without the tenant identifier or unreadable linked targets. */
export function projectGoal(goal: Goal, today: string, links: GoalLinkMeasurements): GoalView {
  const { id, name, ownerUserId, dueDate, spaceId, quarter, version } = goal.snapshot;
  const progress = measureGoal(goal.snapshot, today, links);
  return {
    id,
    name,
    ownerUserId,
    dueDate,
    spaceId,
    quarter,
    version,
    progressPercent: progress.progressPercent,
    health: progress.health,
    results: progress.results,
  };
}
