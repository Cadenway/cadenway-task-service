import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import { SprintDatesInvalidError } from '../../../../../domain/errors/list/sprint-dates-invalid.error.js';
import type { GrantEntry } from '../../../../../domain/value-objects/access/grant-entry.value-object.js';
import type { TaskListUpdate } from '../../../../../domain/value-objects/list/task-list-update.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { StoredGrant } from '../../../../models/access/stored-grant.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { EditableListLocator } from '../../../../services/list/editable-list-locator.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { UpdateListInput } from './update-list.input.js';
import type { UpdateListOutput } from './update-list.output.js';

/**
 * Class UpdateList
 *
 * @description
 * Changes a list or sprint the actor has `edit` on (`PATCH /internal/v1/lists/{listId}`). The list
 * is locked until the end of the transaction by the guard of every write of a list
 * (`EditableListLocator`), so two changes of one list apply one after the other. Refusals, in this
 * order: a list that does not exist, or that the actor does not see, answers `list-not-found`; one
 * they see without `edit` `role-insufficient` with their role; an `If-Match` that does not name the
 * stored version `version-mismatch` with it; the domain decides
 * what changes (`TaskList.update`), and a sprint that ends before it starts answers
 * `sprint-dates-invalid`. A patch that changes nothing writes nothing, appends no event and
 * answers the stored version. A change writes the list at its next version, ONE for the whole
 * patch, and appends in the same tenant transaction `list.updated.v1` when its name, look or
 * sprint changed, then `list.access-changed.v1` (`changed: ['organizationAccess']`, no
 * `changedUserIds`, every grant of the list) when its switch "Accès de l’organisation" did, both
 * with that version. The answer carries `callerRole: 'edit'`: the actor had it, and a change only
 * takes it away when a plain member turns the switch off, which answers the role the change was
 * made with.
 */
export class UpdateList {
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
   * Applies the patch.
   *
   * @param {UpdateListInput} input - The actor, the list, the versions `If-Match` accepts (`null`
   * when absent) and the patch.
   * @returns {Promise<UpdateListOutput>} The list after the change.
   * @throws {SpaceRefusal} `organization-not-found`, `list-not-found`, `role-insufficient`,
   * `version-mismatch` or `sprint-dates-invalid`.
   * @throws {InvalidListError} When the domain refuses a value the API layer let through.
   */
  public async execute(input: UpdateListInput): Promise<UpdateListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<UpdateListOutput> => {
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
      const { list, changed, accessChanged }: TaskListUpdate = this.applyPatch(stored, input);
      if (changed.length > 0 || accessChanged) {
        const actor: EventActor = { type: 'user', id: input.actorUserId };
        await store.lists.update(list);
        if (changed.length > 0) {
          await store.events.listUpdated(list, changed, actor);
        }
        if (accessChanged) {
          const grants: StoredGrant[] = await store.grants.listOf(input.organizationId, {
            kind: 'list',
            spaceId: list.snapshot.spaceId,
            listId: list.snapshot.id,
          });
          await store.events.listAccessChanged(
            list,
            grants.map((grant: StoredGrant): GrantEntry => ({
              userId: grant.userId,
              role: grant.role,
            })),
            ['organizationAccess'],
            [],
            actor,
          );
        }
      }
      return { list: list.snapshot, callerRole: 'edit' };
    });
  }

  /**
   * Method applyPatch
   *
   * @description
   * Calls the domain and maps its refusal to that of the use case.
   *
   * @param {TaskList} stored - The locked list.
   * @param {UpdateListInput} input - The request.
   * @returns {TaskListUpdate} The list after the patch and what changed.
   * @throws {SpaceRefusal} `sprint-dates-invalid`.
   */
  private applyPatch(stored: TaskList, input: UpdateListInput): TaskListUpdate {
    try {
      return stored.update(input.patch);
    } catch (error: unknown) {
      if (error instanceof SprintDatesInvalidError) {
        throw new SpaceRefusal({ reason: 'sprint-dates-invalid' });
      }
      throw error;
    }
  }
  // #endregion
}
