import { canWriteTasksOf } from '../../../domain/policies/task/task-write.policy.js';
import { isRestorable } from '../../../domain/policies/trash/trash-entry.policy.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { TrashListAccess } from '../../models/placement/trash-list-access.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { ReadonlyTasksStore } from '../../models/transactions/readonly-tasks-store.model.js';
import type { TrashEntryRecord } from '../../models/trash/trash-entry-record.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';

/**
 * Class TrashEntryLocator
 *
 * @description
 * Finds a trash entry the actor may restore ("Who" of `openapi/public/trash.yaml`: "the entries of
 * the lists the caller could change, with `edit` (for a deleted list, the role they would have on
 * it); deleting, restoring and erasing need the same"): an entry still in the trash, not handed to
 * the purge by "Vider la corbeille", of a list on which the actor has `edit` as if neither the list
 * nor its space were deleted. Any other entry is not found, and the answer says nothing of why
 * (`404 trash-entry.not-found`, no `403`). The organization of the request scopes every read.
 */
export class TrashEntryLocator {
  // #region Properties
  /** The spaces module, for the role the actor would have on the list of the entry. */
  private readonly spaces: SpaceDirectory;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the directory of the spaces.
   *
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(spaces: SpaceDirectory) {
    this.spaces = spaces;
  }
  // #endregion

  // #region Methods
  /**
   * Method findRestorable
   *
   * @description
   * Reads the entry without a lock and checks that the actor may restore it.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the request.
   * @param {Viewer} viewer - The acting member.
   * @param {string} entryId - The entry.
   * @returns {Promise<TrashEntryRecord | null>} The entry, or `null` when it is unknown, handed to
   * the purge, or of a list the actor could not change.
   */
  public async findRestorable(
    store: ReadonlyTasksStore,
    organizationId: string,
    viewer: Viewer,
    entryId: string,
  ): Promise<TrashEntryRecord | null> {
    const entry: TrashEntryRecord | null = await store.trash.find(organizationId, entryId);
    if (entry === null || !isRestorable(entry.purgeRequest)) {
      return null;
    }
    const access: TrashListAccess | null = await this.spaces.findTrashList(
      organizationId,
      viewer,
      entry.listId,
    );
    return access !== null && canWriteTasksOf(access.role) ? entry : null;
  }

  /**
   * Method lockRestorable
   *
   * @description
   * Finds the entry as `findRestorable` does, then locks it `FOR UPDATE` and checks it again on the
   * locked row: a restoration or an erasure of the same entry that committed meanwhile leaves it
   * gone, and "Vider la corbeille" leaves it handed over.
   *
   * @param {TasksStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the request.
   * @param {Viewer} viewer - The acting member.
   * @param {string} entryId - The entry.
   * @returns {Promise<TrashEntryRecord>} The entry, locked.
   * @throws {TaskRefusal} `trash-entry-not-found`.
   */
  public async lockRestorable(
    store: TasksStore,
    organizationId: string,
    viewer: Viewer,
    entryId: string,
  ): Promise<TrashEntryRecord> {
    const found: TrashEntryRecord | null = await this.findRestorable(
      store,
      organizationId,
      viewer,
      entryId,
    );
    if (found === null) {
      throw new TaskRefusal({ reason: 'trash-entry-not-found' });
    }
    const locked: TrashEntryRecord | null = await store.trash.lock(organizationId, found.id);
    if (locked === null || !isRestorable(locked.purgeRequest) || locked.listId !== found.listId) {
      throw new TaskRefusal({ reason: 'trash-entry-not-found' });
    }
    return locked;
  }
  // #endregion
}
