import type { SpaceStatusUse } from '../../value-objects/task/space-status-use.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';

// App.dc.html (Git automations) groups statuses with the same rank.
const gitRank: Readonly<Record<StatusKey, number>> = Object.freeze({
  triage: 0,
  backlog: 0,
  todo: 0,
  waiting: 1,
  progress: 1,
  blocked: 1,
  review: 2,
  testing: 3,
  done: 4,
  cancelled: 4,
});

/**
 * Determines whether a verified Git action may attempt a status change. The Git automations in
 * App.dc.html only advance rank and skip milestones. The internal Git action also skips hidden
 * targets and requires cancellation to stay outside Git. A link-only action has a null target.
 * The ordinary Task mutation enforces the remaining status invariants.
 */
export function canApplyGitStatus(
  task: Pick<TaskState, 'status' | 'milestone'>,
  target: StatusKey | null,
  statuses: SpaceStatusUse,
): boolean {
  return (
    target !== null &&
    target !== 'cancelled' &&
    task.milestone !== true &&
    gitRank[target] > gitRank[task.status] &&
    !statuses[target].hidden
  );
}
