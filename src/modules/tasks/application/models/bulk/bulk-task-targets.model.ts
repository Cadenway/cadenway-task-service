import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { ListPlacement } from '../placement/list-placement.model.js';
import type { LocatedTask } from '../task/located-task.model.js';
import type { TrashTree } from '../trash/trash-tree.model.js';

/** The authorized selection and its locked expansion, ordered by the request. */
export interface BulkTaskTargets {
  // #region Properties
  /** Explicit selections after authorization, in request order. */
  readonly selection: readonly LocatedTask[];

  /** Disjoint subtrees when the action moves or trashes tasks. */
  readonly trees: readonly TrashTree[];

  /** All held task rows, including source parents when copying. */
  readonly locked: ReadonlyMap<string, Task>;

  /** The held destination for a move. */
  readonly destination: ListPlacement | null;

  /** Memberships held before the task locks, indexed by account ID. */
  readonly candidates: ReadonlyMap<string, AssigneeCandidate>;
  // #endregion
}
