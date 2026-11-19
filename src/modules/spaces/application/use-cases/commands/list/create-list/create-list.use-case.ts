import { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { SprintDatesInvalidError } from '../../../../../domain/errors/list/sprint-dates-invalid.error.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskListDraft } from '../../../../../domain/value-objects/list/task-list-draft.value-object.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { CreateListInput } from './create-list.input.js';
import type { CreateListOutput } from './create-list.output.js';

/**
 * Class CreateList
 *
 * @description
 * Creates a list, with or without a sprint, in a space the actor has `edit` on
 * (`POST /internal/v1/spaces/{spaceId}/lists`). A space that does not exist or that the actor does
 * not see answers `space-not-found`; one they see without `edit` on it `role-insufficient` with
 * their role there (`null` for a space seen only through some of its lists, as a guest does). The
 * domain validates the list (`TaskList.create`), its switch "Accès de l’organisation" as asked; a
 * sprint that ends before it starts answers `sprint-dates-invalid`. The list is stored after the
 * others of its space and `list.created.v1` is appended in the same tenant transaction. The answer
 * carries `callerRole: 'edit'`: the creator has `edit` on the new list, or lost it only to the
 * switch they turned off, and the answer then carries the role it was created with. Rules:
 * "Access" of `openapi/public/spaces.yaml`, "Who changes what" of `openapi/public/lists.yaml`.
 */
export class CreateList {
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
   * Property access
   *
   * @description
   * Decides what the actor reaches of the space.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;
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
    this.access = new AccessResolver();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Creates the list.
   *
   * @param {CreateListInput} input - The validated request of the actor.
   * @returns {Promise<CreateListOutput>} The stored list.
   * @throws {SpaceRefusal} `organization-not-found`, `space-not-found`, `role-insufficient` or
   * `sprint-dates-invalid`.
   * @throws {InvalidListError} When the domain refuses a field the API layer let through.
   */
  public async execute(input: CreateListInput): Promise<CreateListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<CreateListOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const space: Space | null = await store.spaces.find(input.organizationId, input.spaceId);
      if (space === null) {
        throw new SpaceRefusal({ reason: 'space-not-found' });
      }
      const access: ViewerAccess = await this.access.resolve(
        store.grants,
        viewer,
        space.snapshot,
        null,
      );
      if (!access.seesSpace) {
        throw new SpaceRefusal({ reason: 'space-not-found' });
      }
      if (access.spaceRole !== 'edit') {
        throw new SpaceRefusal({ reason: 'role-insufficient', role: access.spaceRole });
      }
      const list: TaskList = await store.lists.insert(this.draft(input));
      await store.events.listCreated(list, { type: 'user', id: input.actorUserId });
      return { list: list.snapshot, callerRole: 'edit' };
    });
  }

  /**
   * Method draft
   *
   * @description
   * Calls the domain and maps its refusal to that of the use case.
   *
   * @param {CreateListInput} input - The request.
   * @returns {TaskListDraft} The validated list.
   * @throws {SpaceRefusal} `sprint-dates-invalid`.
   */
  private draft(input: CreateListInput): TaskListDraft {
    try {
      return TaskList.create({
        organizationId: input.organizationId,
        spaceId: input.spaceId,
        name: input.name,
        icon: input.icon,
        color: input.color,
        sprint: input.sprint,
        organizationAccess: input.organizationAccess,
      });
    } catch (error: unknown) {
      if (error instanceof SprintDatesInvalidError) {
        throw new SpaceRefusal({ reason: 'sprint-dates-invalid' });
      }
      throw error;
    }
  }
  // #endregion
}
