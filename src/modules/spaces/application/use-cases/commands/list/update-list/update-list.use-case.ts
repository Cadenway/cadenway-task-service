import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { SprintDatesInvalidError } from '../../../../../domain/errors/list/sprint-dates-invalid.error.js';
import type { TaskListUpdate } from '../../../../../domain/value-objects/list/task-list-update.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { UpdateListInput } from './update-list.input.js';
import type { UpdateListOutput } from './update-list.output.js';

/**
 * Class UpdateList
 *
 * @description
 * Changes a list or sprint of a space the actor sees (`PATCH /internal/v1/lists/{listId}`). The
 * list is locked until the end of the transaction, so two changes of one list apply one after the
 * other. A list that does not exist, or whose space the actor does not see, answers
 * `list-not-found`; an `If-Match` that does not name the stored version answers `version-mismatch`
 * with it. The domain decides what changes (`TaskList.update`); a sprint that ends before it
 * starts answers `sprint-dates-invalid`. A patch that changes nothing writes nothing, appends no
 * event and answers the stored version; a change writes the list (its version grows) and appends
 * `list.updated.v1` in the same tenant transaction.
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
   * @throws {SpaceRefusal} `organization-not-found`, `list-not-found`, `version-mismatch` or
   * `sprint-dates-invalid`.
   * @throws {InvalidListError} When the domain refuses a value the API layer let through.
   */
  public async execute(input: UpdateListInput): Promise<UpdateListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<UpdateListOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const stored: TaskList | null = await store.lists.lock(input.organizationId, input.listId);
      if (stored === null) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      const space: Space | null = await store.spaces.find(
        input.organizationId,
        stored.snapshot.spaceId,
      );
      if (!space?.isVisibleTo(viewer)) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      const storedVersion: number = stored.snapshot.version;
      if (input.expectedVersions !== null && !input.expectedVersions.includes(storedVersion)) {
        throw new SpaceRefusal({ reason: 'version-mismatch', version: storedVersion });
      }
      const { list, changed }: TaskListUpdate = this.applyPatch(stored, input);
      if (changed.length > 0) {
        await store.lists.update(list);
        await store.events.listUpdated(list, changed, { type: 'user', id: input.actorUserId });
      }
      return list.snapshot;
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
