import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';

/**
 * Interface LocateRequest
 *
 * @description
 * What `TaskLocator` needs to find a task for an actor.
 */
export interface LocateRequest {
  // #region Properties
  /** The organization of the request context. */
  readonly organizationId: string;

  /** The acting member, with the role of the copy. */
  readonly viewer: Viewer;

  /** The key of the task, as the path carries it. */
  readonly taskKey: string;

  /** `true` when the operation changes the task: the actor needs `edit` on the list it is in. */
  readonly edit: boolean;

  /** `true` in a write: the task is locked `FOR NO KEY UPDATE` until the commit. */
  readonly lock: boolean;

  /**
   * `refuse` for a change of the task, which an archived task refuses (`task-archived`, after the
   * role and before `If-Match`); `allow` for a read, the archive and the restoration.
   */
  readonly archived: 'refuse' | 'allow';

  /** The versions `If-Match` accepts, `null` when absent or `*`, or when the route has none. */
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
