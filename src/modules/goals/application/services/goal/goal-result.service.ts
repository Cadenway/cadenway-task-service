import type { Goal } from '../../../domain/aggregates/goal/goal.aggregate.js';
import type { GoalResult } from '../../../domain/value-objects/goal/goal-result.value-object.js';
import type { MeasuredGoalResult } from '../../../domain/value-objects/goal/measured-goal-result.value-object.js';
import { GoalError } from '../../models/goal/goal-error.model.js';
import type { GoalViewer } from '../../models/goal/goal-viewer.model.js';
import type { GoalsStore } from '../../models/goal/goals-store.model.js';
import { projectGoal } from './goal-projection.service.js';
import { requireVisibleTargets } from './goal-access.service.js';

/** Finds an existing result and checks its target through a write. */
export async function requireResult(
  store: GoalsStore,
  viewer: GoalViewer,
  goal: Goal,
  resultId: string,
  lock: boolean,
): Promise<GoalResult> {
  const result = goal.snapshot.results.find((entry) => entry.id === resultId.toLowerCase());
  if (result === undefined) {
    if (lock) {
      await requireVisibleTargets(
        store,
        viewer,
        [],
        'missing-result',
        true,
        goal.snapshot.spaceId,
        'missing-goal',
      );
    }
    throw new GoalError({ reason: 'missing-result' });
  }
  if (lock) {
    await requireVisibleTargets(
      store,
      viewer,
      [result],
      'missing-result',
      true,
      goal.snapshot.spaceId,
      'missing-goal',
    );
  }
  return result;
}

/** Projects a single result, hiding a target that the caller can no longer read. */
export async function projectResult(
  store: GoalsStore,
  viewer: GoalViewer,
  goal: Goal,
  resultId: string,
): Promise<MeasuredGoalResult> {
  const links = await store.measureLinks(viewer, goal.snapshot.results, false);
  const result = projectGoal(goal, goal.snapshot.dueDate, links).results.find(
    (entry) => entry.id === resultId.toLowerCase(),
  );
  if (result === undefined) throw new GoalError({ reason: 'missing-result' });
  return result;
}
