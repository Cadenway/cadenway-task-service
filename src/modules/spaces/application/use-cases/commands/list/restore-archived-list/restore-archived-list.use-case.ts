import type { TaskListArchiveChange } from '../../../../../domain/value-objects/list/task-list-archive-change.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { EditableListLookup } from '../../../../models/list/editable-list-lookup.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { EditableListLocator } from '../../../../services/list/editable-list-locator.service.js';
import type { RestoreArchivedListInput } from './restore-archived-list.input.js';
import type { RestoreArchivedListOutput } from './restore-archived-list.output.js';

/**
 * Class RestoreArchivedList
 *
 * @description
 * Public operation of the spaces module for the tasks module: restores the archived list of an
 * archived task the member restores ("Restoring any task of an archive restores the whole archive,
 * from its root, to its list, which is restored too when it is archived" of
 * `openapi/public/archives.yaml`). Through the guard of every write of a list
 * (`EditableListLocator.find`), it holds its space `FOR SHARE` and locks the list
 * `FOR NO KEY UPDATE` until the end of the transaction (after the tasks the caller locked), and
 * computes the role of the member on the list with the policies of the domain, from the role in the
 * organization the caller passes (no membership is read). A list that does not exist, of another
 * organization or that the member has no role on answers `not-found`; a role without `edit`
 * answers `role-insufficient`; a live list answers `not-archived`. Each of these writes nothing,
 * so the caller decides what to answer. An archived list is restored as `UnarchiveList` restores
 * it (the instant of the transaction, the next version) and `list.unarchived.v1` is appended with
 * the member as actor, before the events the caller appends next. It runs in
 * `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller.
 */
export class RestoreArchivedList {
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
   * Property lists
   *
   * @description
   * Locks the list and answers the refusals of a write, which this operation maps to its outcomes.
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
   * Takes the transaction port.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork) {
    this.unitOfWork = unitOfWork;
    this.lists = new EditableListLocator();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Restores the list when it is archived and the member has `edit` on it.
   *
   * @param {RestoreArchivedListInput} input - The member, its role and the list.
   * @returns {Promise<RestoreArchivedListOutput>} What the restoration did.
   */
  public async execute(input: RestoreArchivedListInput): Promise<RestoreArchivedListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<RestoreArchivedListOutput> => {
      const viewer: Viewer = { userId: input.actorUserId, role: input.viewerRole };
      const found: EditableListLookup = await this.lists.find(
        store,
        viewer,
        input.organizationId,
        input.listId,
      );
      if (found.outcome === 'list-not-found') {
        return { outcome: 'not-found' };
      }
      if (found.outcome === 'role-insufficient') {
        return { outcome: 'role-insufficient', role: found.role };
      }
      const { list, changed }: TaskListArchiveChange = found.list.unarchive(
        await store.clock.now(),
      );
      if (!changed) {
        return { outcome: 'not-archived' };
      }
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      await store.lists.update(list);
      await store.events.listUnarchived(list, actor);
      return { outcome: 'restored' };
    });
  }
  // #endregion
}
