import type { TaskActor } from '../task/task-actor.value-object.js';

/**
 * Interface TrashHandOver
 *
 * @description
 * The hand-over of a trash entry to the purge by "Vider la corbeille" (`POST /v1/trash/empty` of
 * `openapi/public/trash.yaml`: "The entries leave the trash at once and no longer restore"): when,
 * and who asked, the actor of the `task.purged.v1` of its tasks.
 */
export interface TrashHandOver {
  // #region Properties
  /** When "Vider la corbeille" took the entry out of the trash. */
  readonly at: Date;

  /** Who asked. */
  readonly by: TaskActor;
  // #endregion
}
