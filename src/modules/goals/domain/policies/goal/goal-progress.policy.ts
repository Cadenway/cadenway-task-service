import { InvalidGoalError } from '../../errors/goal/invalid-goal.error.js';
import type { GoalLinkMeasurements } from '../../value-objects/goal/goal-link-measurements.value-object.js';
import type { GoalProgress } from '../../value-objects/goal/goal-progress.value-object.js';
import { GoalQuarter } from '../../value-objects/goal/goal-quarter.value-object.js';
import type { GoalResult } from '../../value-objects/goal/goal-result.value-object.js';
import type { GoalState } from '../../value-objects/goal/goal-state.value-object.js';
import type { MeasuredGoalResult } from '../../value-objects/goal/measured-goal-result.value-object.js';

/**
 * Gives each visible result equal weight and compares the unrounded progress against elapsed
 * quarter time (P3c brief, P3c-2 and `components/goals.yaml`). Callers supply measurements for
 * links they can currently read and a reference calendar date.
 */
export function measureGoal(
  goal: GoalState,
  today: string,
  links: GoalLinkMeasurements,
): GoalProgress {
  const results: MeasuredGoalResult[] = [];
  let total = 0;
  for (const result of goal.results) {
    const measured = measureResult(result, links);
    if (measured !== undefined) {
      results.push(measured);
      total += measured.progressPercent;
    }
  }
  const progressPercent = results.length === 0 ? 0 : total / results.length;
  const expectedProgressPercent = GoalQuarter.parse(goal.quarter).expectedProgress(today);
  return {
    results,
    progressPercent,
    expectedProgressPercent,
    health: measureHealth(progressPercent, expectedProgressPercent),
  };
}

/** Computes the visible read representation of a stored result. */
function measureResult(
  result: GoalResult,
  links: GoalLinkMeasurements,
): MeasuredGoalResult | undefined {
  switch (result.kind) {
    case 'number':
      return { ...result, progressPercent: measureNumber(result) };
    case 'checkbox':
      return { ...result, progressPercent: result.checked ? 100 : 0 };
    case 'list-progress': {
      const measurement = links.lists.get(result.listId);
      if (measurement === undefined) return undefined;
      const { eligibleTaskCount, doneTaskCount } = measurement;
      return {
        ...result,
        eligibleTaskCount,
        doneTaskCount,
        progressPercent: measureList(eligibleTaskCount, doneTaskCount),
      };
    }
    case 'milestone': {
      const reached = links.milestones.get(result.taskKey);
      return reached === undefined
        ? undefined
        : { ...result, reached, progressPercent: reached ? 100 : 0 };
    }
  }
}

/** Clamps progress towards either direction of a numeric target, including equal endpoints. */
function measureNumber(result: Extract<GoalResult, { kind: 'number' }>): number {
  const { startValue, currentValue, targetValue } = result;
  if (startValue === targetValue) return currentValue === targetValue ? 100 : 0;
  if (targetValue > startValue) {
    if (currentValue <= startValue) return 0;
    if (currentValue >= targetValue) return 100;
  } else {
    if (currentValue >= startValue) return 0;
    if (currentValue <= targetValue) return 100;
  }
  const span = targetValue - startValue;
  if (Number.isFinite(span)) return ((currentValue - startValue) / span) * 100;

  // A finite start and target can span more than Number.MAX_VALUE.
  return ((currentValue / 2 - startValue / 2) / (targetValue / 2 - startValue / 2)) * 100;
}

/** Scores a live, non-cancelled task population as a percentage. */
function measureList(eligibleTaskCount: number, doneTaskCount: number): number {
  if (
    !Number.isSafeInteger(eligibleTaskCount) ||
    !Number.isSafeInteger(doneTaskCount) ||
    doneTaskCount < 0 ||
    doneTaskCount > eligibleTaskCount
  ) {
    throw new InvalidGoalError(
      'invalid-link-measurement',
      'done tasks are part of the eligible task population',
    );
  }
  return eligibleTaskCount === 0 ? 0 : (doneTaskCount / eligibleTaskCount) * 100;
}

/** Classifies the raw score using the inclusive thresholds in `components/goals.yaml`. */
function measureHealth(progress: number, expected: number): GoalProgress['health'] {
  if (progress === 100) return 'achieved';
  if (progress >= expected - 5) return 'on-track';
  return progress >= expected - 20 ? 'at-risk' : 'behind';
}
