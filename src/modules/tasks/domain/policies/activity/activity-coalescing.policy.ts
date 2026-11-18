import type { ActivityChange } from '../../value-objects/activity/activity-change.value-object.js';
import type { ActivityEntryDraft } from '../../value-objects/activity/activity-entry-draft.value-object.js';
import type { ActivityEntryState } from '../../value-objects/activity/activity-entry-state.value-object.js';
import type { ActivityKind } from '../../value-objects/activity/activity-kind.value-object.js';
import type { ActivityWrite } from '../../value-objects/activity/activity-write.value-object.js';
import { COALESCING_WINDOW_MS } from '../../value-objects/task/task-limits.value-object.js';

/**
 * Function coalesces
 *
 * @description
 * Whether entries of a kind merge: only the changes of the priority and of the due date do
 * (`openapi/public/tasks.yaml:46-48`; `openapi/internal/task-service.yaml:676-678`). Every status
 * change and every assignment is an entry of its own, since every request is applied
 * (`openapi/public/tasks.yaml:20-22`). The application reads a merge candidate only for these
 * kinds.
 *
 * @param {ActivityKind} kind - The kind of the new entry.
 * @returns {boolean} Whether it may merge into an earlier entry.
 */
export function coalesces(kind: ActivityKind): boolean {
  return kind === 'priority' || kind === 'due';
}

/**
 * Function mergeable
 *
 * @description
 * Whether a candidate entry absorbs a new one: same task, same kind, same actor (type and id),
 * same list, and the new change at most 60,000 ms after the candidate's `occurredAt`, a sliding
 * window since a merge moves that instant (open questions 1 and 2 of the design).
 *
 * @param {ActivityEntryDraft} draft - The new entry.
 * @param {ActivityEntryState} candidate - The latest entry of the same kind for the task.
 * @returns {boolean} Whether they merge.
 */
function mergeable(draft: ActivityEntryDraft, candidate: ActivityEntryState): boolean {
  return (
    candidate.organizationId === draft.organizationId &&
    candidate.taskId === draft.taskId &&
    candidate.change.kind === draft.change.kind &&
    candidate.actor.type === draft.actor.type &&
    candidate.actor.id === draft.actor.id &&
    candidate.listId === draft.listId &&
    draft.occurredAt.getTime() - candidate.occurredAt.getTime() <= COALESCING_WINDOW_MS
  );
}

/**
 * Function merged
 *
 * @description
 * The change of a merged entry: the `from` of the candidate and the `to` of the new change, or
 * `null` when they are equal, so that the entry disappears ("which disappears when the value is
 * back to where it was", `openapi/public/tasks.yaml:47-48`). For the due date, two `null` are
 * equal.
 *
 * @param {ActivityChange} earlier - The change of the candidate.
 * @param {ActivityChange} later - The new change, of the same kind.
 * @returns {ActivityChange | null} The merged change, `null` when it changes nothing, or `undefined`
 * when the kinds do not merge.
 */
function merged(earlier: ActivityChange, later: ActivityChange): ActivityChange | null | undefined {
  if (earlier.kind === 'priority' && later.kind === 'priority') {
    const { from } = earlier.priority;
    const { to } = later.priority;
    return from === to ? null : { kind: 'priority', priority: { from, to } };
  }
  if (earlier.kind === 'due' && later.kind === 'due') {
    const { from } = earlier.dueDate;
    const { to } = later.dueDate;
    return from === to ? null : { kind: 'due', dueDate: { from, to } };
  }
  return undefined;
}

/**
 * Function coalesceActivity
 *
 * @description
 * What to write for one recorded change (§4 of the design; `openapi/public/tasks.yaml:46-48`;
 * `openapi/internal/task-service.yaml:676-678` and 2641-2644):
 *
 * 1. a change other than of the priority or the due date, or without a mergeable candidate, is
 *    inserted;
 * 2. otherwise it merges into the candidate: the candidate keeps its id and its `from`, takes the
 *    new `to`, and its `occurredAt` becomes the instant of the new change;
 * 3. a merge back to the value the candidate started from deletes the candidate.
 *
 * The candidate is the latest entry of the same kind for the task, whatever its actor: an
 * intervening change by someone else breaks the chain. The row lock of the task serializes the
 * merges of a task.
 *
 * @param {ActivityEntryDraft} draft - The new entry.
 * @param {ActivityEntryState | null} candidate - The latest entry of the same kind for the task,
 * or `null` when there is none.
 * @returns {ActivityWrite} The write: insert the draft, update the candidate, or delete it.
 */
export function coalesceActivity(
  draft: ActivityEntryDraft,
  candidate: ActivityEntryState | null,
): ActivityWrite {
  if (!coalesces(draft.change.kind) || candidate === null || !mergeable(draft, candidate)) {
    return { action: 'insert', entry: draft };
  }
  const change: ActivityChange | null | undefined = merged(candidate.change, draft.change);
  if (change === undefined) {
    return { action: 'insert', entry: draft };
  }
  if (change === null) {
    return { action: 'delete', entry: candidate };
  }
  return { action: 'update', entry: { ...candidate, change, occurredAt: draft.occurredAt } };
}
