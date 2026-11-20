import type { TaskReferenceView } from '../../projections/task/task-reference.projection.js';
import type { TrashEntryDraft } from './trash-entry-draft.model.js';
import type { TrashHandOver } from '../../../domain/value-objects/trash/trash-hand-over.value-object.js';

/**
 * Interface TrashEntryRecord
 *
 * @description
 * A stored trash entry with its id, the key, name and status of its root as they are now (the
 * tasks of an entry never change while it is in the trash, but for the removal of a member), and
 * its hand-over to the purge job, if any. An entry handed over is out of the trash: it no longer
 * lists, restores or erases by a person, and its tasks answer `404 task.not-found`.
 */
export interface TrashEntryRecord extends TrashEntryDraft {
  // #region Properties
  /** Id of the entry, from PostgreSQL. */
  readonly id: string;

  /** The root, as `TaskRef` names it. */
  readonly root: TaskReferenceView;

  /** The hand-over to the purge job by "Vider la corbeille", `null` while in the trash. */
  readonly purgeRequest: TrashHandOver | null;

  /** Whether the purge events for this entry have been committed. */
  readonly purgeStarted: boolean;
  // #endregion
}
