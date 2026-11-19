import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { TaskListArchiveChange } from '../../../../../domain/value-objects/list/task-list-archive-change.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { EditableListLocator } from '../../../../services/list/editable-list-locator.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { UnarchiveListInput } from './unarchive-list.input.js';
import type { UnarchiveListOutput } from './unarchive-list.output.js';

/**
 * Class UnarchiveList
 *
 * @description
 * Restores an archived list or sprint the actor has `edit` on at the end of its space
 * (`POST /internal/v1/lists/{listId}/unarchive`, "Restaurer la liste", decision 6 of P3b-1,
 * "Lists" of `openapi/public/archives.yaml`). The membership of the actor is read `FOR SHARE`,
 * then the list is locked until the end of the transaction. Refusals, in this order:
 * `list-not-found` (unknown, or no role on it), `role-insufficient` (a role without `edit`),
 * `version-mismatch` (`If-Match`). A live list answers the stored version, writes nothing and
 * appends nothing. Otherwise the archive is cleared, `restoredAt` = the instant of the
 * transaction puts the list at the end of its space, it takes the next version, and
 * `list.unarchived.v1` is appended in the same tenant transaction. The answer carries
 * `callerRole: 'edit'`, the role the restoration was made with.
 */
export class UnarchiveList {
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
   * Restores the list.
   *
   * @param {UnarchiveListInput} input - The actor, the list and the versions `If-Match` accepts
   * (`null` when absent).
   * @returns {Promise<UnarchiveListOutput>} The list after the restoration.
   * @throws {SpaceRefusal} `organization-not-found`, `list-not-found`, `role-insufficient` or
   * `version-mismatch`.
   */
  public async execute(input: UnarchiveListInput): Promise<UnarchiveListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<UnarchiveListOutput> => {
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
      const { list, changed }: TaskListArchiveChange = stored.unarchive(await store.clock.now());
      if (changed) {
        const actor: EventActor = { type: 'user', id: input.actorUserId };
        await store.lists.update(list);
        await store.events.listUnarchived(list, actor);
      }
      return { list: list.snapshot, callerRole: 'edit' };
    });
  }
  // #endregion
}
