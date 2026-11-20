import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import { listRoleAsIfNotDeletedOf } from '../../../../../domain/policies/access/access-role.policy.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TrashListAccess } from '../../../../models/list/trash-list-access.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { LockTrashListsInput } from './lock-trash-lists.input.js';
import type { LockTrashListsOutput } from './lock-trash-lists.output.js';

/** One answer of `LockTrashLists`. */
type TrashListLock = LockTrashListsOutput['lists'][number];

/**
 * Class LockTrashLists
 *
 * @description
 * Public operation of the spaces module for the tasks module: locks the lists of trash entries
 * before the caller hands the entries over to the purge ("Vider la corbeille", `hold`) or erases
 * them (`erase`), whether the lists are live or deleted, and reads the role of the viewer on them
 * again under those locks. It reads the lists without lock in one statement, then locks their
 * spaces one by one in the order `(created_at, id)` of every locker of several spaces
 * (`SpaceRepository.lockInOrder`), then the lists in one statement in ascending id, the order of
 * every locker of several lists, which reads them again: spaces before lists, after the entries
 * and the tasks the caller locked (the global order of `src/modules/tasks/MODULE.md`).
 *
 * `hold` takes `FOR SHARE` on both: a change of the visibility, the owner or the grants of a
 * space, a change of the grants of a list and a deletion of either lock them
 * `FOR NO KEY UPDATE`, so each either committed before the role is read again (and is seen) or
 * waits for the commit of the caller. `erase` takes the spaces `FOR NO KEY UPDATE` and the lists
 * `FOR UPDATE`, whether live or deleted: a deletion of a list committed while the caller waited is
 * read `deleted` under the lock, so the caller erases the tombstone it leaves without a task; a
 * deletion not committed yet waits for the caller, whose erased tasks its job then no longer
 * sees; and `PurgeDeletedList` later takes no stronger list lock. The `FOR UPDATE` conflicts with
 * the `FOR SHARE` of `HoldList`, of a batch of the deletion job and of a creation of a task.
 * The role is read in one statement after the locks, as `FindTrashList` and `ListTrashLists` read
 * it. It runs in `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller; it
 * writes nothing. Cost: one statement per space of the lists (an organization holds few spaces),
 * two for the lists, O(lists given), and the role: one lean row for one list, the lean rows of
 * every list of the organization the viewer has a role on for several (O(lists of the
 * organization), as `ListTrashLists`).
 */
export class LockTrashLists {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the use case.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Locks the lists given and their spaces, and reads where each stands and the role of the
   * viewer on it.
   *
   * @param {LockTrashListsInput} input - The organization, the lists, the mode and the viewer.
   * @returns {Promise<LockTrashListsOutput>} Where each list stands.
   */
  public async execute(input: LockTrashListsInput): Promise<LockTrashListsOutput> {
    const listIds: string[] = [...new Set(input.listIds)];
    if (listIds.length === 0) {
      return { lists: [] };
    }
    return this.unitOfWork.run(async (store: SpacesStore): Promise<LockTrashListsOutput> => {
      const { organizationId } = input;
      const seen: readonly TaskList[] = await store.lists.findManyIncludingDeleted(
        organizationId,
        listIds,
      );
      const spaceMode: 'share' | 'update' = input.mode === 'hold' ? 'share' : 'update';
      await store.spaces.lockInOrder(
        organizationId,
        [...new Set(seen.map((list: TaskList): string => list.snapshot.spaceId))].map(
          (id: string): { readonly id: string; readonly mode: 'share' | 'update' } => ({
            id,
            mode: spaceMode,
          }),
        ),
      );
      const locked = new Map<string, TaskList>(
        (
          await store.lists.lockMany(
            organizationId,
            seen.map((list: TaskList): string => list.snapshot.id),
            input.mode === 'hold' ? 'share' : 'delete',
          )
        ).map((list: TaskList): [string, TaskList] => [list.snapshot.id, list]),
      );
      const roles: ReadonlyMap<string, AccessRole> =
        input.viewer === null || locked.size === 0
          ? new Map<string, AccessRole>()
          : await this.rolesOf(store, organizationId, input.viewer, [...locked.keys()]);
      return {
        lists: listIds.map((listId: string): TrashListLock => {
          const list: TaskList | undefined = locked.get(listId);
          if (list === undefined) {
            return { listId, outcome: 'not-found', role: null };
          }
          return {
            listId,
            outcome: list.isDeleted ? 'deleted' : 'live',
            role: roles.get(listId) ?? null,
          };
        }),
      };
    });
  }

  /**
   * Method rolesOf
   *
   * @description
   * The role of the viewer on each locked list, as if neither the list nor its space were deleted,
   * read after the locks: one lean row for one list (`findTrashAccessVisibleTo`), else the lean
   * rows of every list of the organization the viewer would have a role on, in one statement
   * (`listTrashAccessesVisibleTo`), kept for the lists given. A list the policy refuses all the
   * same is left out (fail closed).
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {readonly string[]} listIds - The locked lists.
   * @returns {Promise<ReadonlyMap<string, AccessRole>>} The role of the viewer by list.
   */
  private async rolesOf(
    store: SpacesStore,
    organizationId: string,
    viewer: Viewer,
    listIds: readonly string[],
  ): Promise<ReadonlyMap<string, AccessRole>> {
    const [only] = listIds;
    const rows: readonly TrashListAccess[] =
      listIds.length === 1 && only !== undefined
        ? [await store.lists.findTrashAccessVisibleTo(organizationId, viewer, only)].filter(
            (row: TrashListAccess | null): row is TrashListAccess => row !== null,
          )
        : await store.lists.listTrashAccessesVisibleTo(organizationId, viewer);
    const wanted: ReadonlySet<string> = new Set(listIds);
    const roles = new Map<string, AccessRole>();
    for (const row of rows) {
      if (!wanted.has(row.listId)) {
        continue;
      }
      const role: AccessRole | null = listRoleAsIfNotDeletedOf(
        row.space,
        { organizationAccess: row.organizationAccess },
        viewer,
        row.grants,
      );
      if (role !== null) {
        roles.set(row.listId, role);
      }
    }
    return roles;
  }
  // #endregion
}
