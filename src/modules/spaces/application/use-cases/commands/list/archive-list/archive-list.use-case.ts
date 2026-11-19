import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { TaskListArchiveChange } from '../../../../../domain/value-objects/list/task-list-archive-change.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { EditableListLocator } from '../../../../services/list/editable-list-locator.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { ArchiveListInput } from './archive-list.input.js';
import type { ArchiveListOutput } from './archive-list.output.js';

/**
 * Class ArchiveList
 *
 * @description
 * Archives a list or a sprint the actor has `edit` on (`POST /internal/v1/lists/{listId}/archive`,
 * "Archiver la liste", decision 6 of P3b-1, "Lists" of `openapi/public/archives.yaml`): it leaves
 * the lists of its space, the overview and "Accueil", and reads by its id; its tasks do not change.
 * The membership of the actor is read `FOR SHARE`, then the list is locked until the end of the
 * transaction. Refusals, in this order: `list-not-found` (unknown, or no role on it),
 * `role-insufficient` (a role without `edit`), `version-mismatch` (`If-Match`). A list archived
 * already answers the stored version, writes nothing and appends nothing. Otherwise the list
 * takes `archivedAt` = the instant of the transaction, `archivedBy` = the actor, the next version,
 * and `list.archived.v1` is appended in the same tenant transaction. The answer carries
 * `callerRole: 'edit'`, the role the archive was made with.
 */
export class ArchiveList {
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

  /**
   * Property viewers
   *
   * @description
   * Resolves the acting member.
   *
   * @type {ViewerResolver}
   * @readonly
   */
  private readonly viewers: ViewerResolver;

  /**
   * Property lists
   *
   * @description
   * Locks the list and applies the refusals of a write.
   *
   * @type {EditableListLocator}
   * @readonly
   */
  private readonly lists: EditableListLocator;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the directory of the members.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork, members: MemberDirectory) {
    this.unitOfWork = unitOfWork;
    this.viewers = new ViewerResolver(members);
    this.lists = new EditableListLocator();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Archives the list.
   *
   * @param {ArchiveListInput} input - The actor, the list and the versions `If-Match` accepts
   * (`null` when absent).
   * @returns {Promise<ArchiveListOutput>} The list after the archive.
   * @throws {SpaceRefusal} `organization-not-found`, `list-not-found`, `role-insufficient` or
   * `version-mismatch`.
   */
  public async execute(input: ArchiveListInput): Promise<ArchiveListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ArchiveListOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const stored: TaskList = await this.lists.lock(
        store,
        viewer,
        input.organizationId,
        input.listId,
        input.expectedVersions,
      );
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      const { list, changed }: TaskListArchiveChange = stored.archive(
        actor,
        await store.clock.now(),
      );
      if (changed) {
        await store.lists.update(list);
        await store.events.listArchived(list, actor);
      }
      return { list: list.snapshot, callerRole: 'edit' };
    });
  }
  // #endregion
}
