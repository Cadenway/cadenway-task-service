import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';

/** Resolves a successor key only while the linked task is live and visible to this viewer. */
export class VisibleNextOccurrence {
  // #region Constructor
  /** Binds the task placement directory. */
  public constructor(private readonly spaces: SpaceDirectory) {}
  // #endregion

  // #region Methods
  /** Reads the linked task within the caller's tenant transaction. */
  public async keyOf(store: TasksStore, source: Task, viewer: Viewer): Promise<string | undefined> {
    const key = source.snapshot.nextOccurrenceKey;
    if (key === null || key === undefined) return undefined;
    const successor = await store.tasks.findByKey(source.snapshot.organizationId, key, false);
    if (!successor?.isLive) return undefined;
    const placement = await this.spaces.findVisibleList(
      source.snapshot.organizationId,
      viewer,
      successor.snapshot.listId,
    );
    return placement === null ? undefined : key.format();
  }
  // #endregion
}
