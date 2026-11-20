import { canWriteTasksOf } from '../../../../../domain/policies/task/task-write.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { TrashListAccess } from '../../../../models/placement/trash-list-access.model.js';
import type { TrashList } from '../../../../models/placement/trash-list.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TrashEntryRecord } from '../../../../models/trash/trash-entry-record.model.js';
import type { TrashPosition } from '../../../../models/trash/trash-position.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TrashEntryView } from '../../../../projections/trash/trash-entry.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import { TrashEntryViewBuilder } from '../../../../services/trash/trash-entry-view-builder.service.js';
import type { ListTrashEntriesInput } from './list-trash-entries.input.js';
import type { ListTrashEntriesOutput } from './list-trash-entries.output.js';

/**
 * Class ListTrashEntries
 *
 * @description
 * Lists the trash of the actor (`GET /internal/v1/trash/entries`; "Corbeille" of
 * `openapi/public/trash.yaml`): the entries of the lists on which the actor has `edit` as if the
 * lists and their spaces were not deleted (`ListTrashLists` of spaces gives every role, the module
 * keeps `edit` with `canWriteTasksOf`; deleted lists included), still
 * in the trash (not handed to the purge by "Vider la corbeille"), the most recently deleted first
 * (`trashed_at desc, id desc`), with `total` on every page. Each entry carries its root as it reads
 * now, its stored parent, its subtasks, its list with its name and state (`active`, `archived` or
 * `deleted`), who deleted it and when, and when it is erased. One read-only `REPEATABLE READ`
 * snapshot: the copy of the memberships, the lists of spaces, the page (`trash_entries_trashed_index`
 * walked backwards from the keyset, the lists a filter of its rows) and the total. An actor with
 * `edit` on no list gets an empty page without a read of the entries; an actor the copy does not
 * hold answers `organization-not-found`.
 */
export class ListTrashEntries {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module, for the lists of the trash of the actor. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Cuts the page. */
  private readonly pages: PageSlicer;

  /** Builds the view of an entry. */
  private readonly views: TrashEntryViewBuilder;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the two directories.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.unitOfWork = unitOfWork;
    this.spaces = spaces;
    this.viewers = new ViewerResolver(members);
    this.pages = new PageSlicer();
    this.views = new TrashEntryViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads one page of the trash.
   *
   * @param {ListTrashEntriesInput} input - The actor, the position and the size of the page.
   * @returns {Promise<ListTrashEntriesOutput>} The page and the total.
   * @throws {TaskRefusal} `organization-not-found`.
   * @throws {Error} When an entry is of a list the spaces module did not give, a defect.
   */
  public async execute(input: ListTrashEntriesInput): Promise<ListTrashEntriesOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: TasksStore): Promise<ListTrashEntriesOutput> => {
        const { organizationId } = input;
        const viewer: Viewer = await this.viewers.resolve(organizationId, input.actorUserId);
        const lists: ReadonlyMap<string, TrashList> = new Map(
          (await this.spaces.trashLists(organizationId, viewer))
            .filter((access: TrashListAccess): boolean => canWriteTasksOf(access.role))
            .map((access: TrashListAccess): [string, TrashList] => [access.list.id, access.list]),
        );
        if (lists.size === 0) {
          return { items: [], next: null, total: 0 };
        }
        const listIds: readonly string[] = [...lists.keys()];
        const rows: readonly TrashEntryRecord[] = await store.trash.pageOfLists(
          organizationId,
          listIds,
          input.after,
          input.limit + 1,
        );
        const page: Slice<TrashEntryRecord, TrashPosition> = this.pages.slice(
          rows,
          input.limit,
          (row: TrashEntryRecord): TrashPosition => ({ trashedAt: row.trashedAt, id: row.id }),
        );
        const total: number = await store.trash.countOfLists(organizationId, listIds);
        return {
          items: page.items.map((row: TrashEntryRecord): TrashEntryView => {
            const list: TrashList | undefined = lists.get(row.listId);
            if (list === undefined) {
              throw new Error(`The list ${row.listId} of the trash entry ${row.id} is unseen.`);
            }
            return this.views.build(row, list);
          }),
          next: page.next,
          total,
        };
      },
      { snapshot: true },
    );
  }
  // #endregion
}
