import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { SubtaskParent } from '../../../domain/value-objects/subtask/subtask-parent.value-object.js';
import type { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { EventActor } from '../actor/event-actor.model.js';
import type { ListPlacement } from '../placement/list-placement.model.js';

/** What a copy operation prepares before creating a task in its own transaction. */
export interface TaskCopyInput {
  // #region Properties
  /** The visible source task. */
  readonly source: Task;
  readonly placement: ListPlacement;
  readonly parent: SubtaskParent | null;
  readonly key: TaskKey;
  readonly assignees: readonly AssigneeCandidate[];
  readonly actor: EventActor & { readonly type: 'user' };
  readonly now: Date;

  /** In a forest copy the task keeps its name and its existing, possibly hidden, status. */
  readonly keepNameAndStatus?: boolean;
  // #endregion
}
