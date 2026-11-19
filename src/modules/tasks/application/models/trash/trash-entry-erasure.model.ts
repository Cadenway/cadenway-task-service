import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { EventActor } from '../actor/event-actor.model.js';
import type { TrashEntryRecord } from './trash-entry-record.model.js';

/**
 * Interface TrashEntryErasure
 *
 * @description
 * One trash entry to erase for good, as its eraser locked it: the entry, its tasks and who erases
 * it (the actor of the `task.purged.v1` of its tasks).
 */
export interface TrashEntryErasure {
  // #region Properties
  /** The entry, locked `FOR UPDATE`. */
  readonly entry: TrashEntryRecord;

  /** Its tasks, locked `FOR UPDATE`, without their checklists. */
  readonly tasks: readonly Task[];

  /** Who erases it. */
  readonly actor: EventActor;
  // #endregion
}
