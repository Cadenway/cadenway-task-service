import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { CheckListAccessInput } from './check-list-access.input.js';
import type { CheckListAccessOutput } from './check-list-access.output.js';

/**
 * Class CheckListAccess
 *
 * @description
 * The access check of the realtime gateway before a socket joins the room of a list
 * (`GET /internal/v1/lists/{listId}/access`): the effective role of the person on the list
 * (`listRoleOf`) and its space. A list that does not exist, or that the person has no role on,
 * answers `list-not-found`, as every route does; a person the copy of the memberships does not
 * hold, `organization-not-found`. One tenant transaction, read only: the list, its space, the
 * membership of the person and, when the rule of the organization does not already give `edit`,
 * one statement for their grants; nothing is written and nothing is emitted.
 */
export class CheckListAccess {
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
   * Resolves the person of the socket.
   *
   * @type {ViewerResolver}
   * @readonly
   */
  private readonly viewers: ViewerResolver;

  /**
   * Property access
   *
   * @description
   * Decides what the person reaches of the list.
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
   * Checks the access of the person to the list.
   *
   * @param {CheckListAccessInput} input - The person and the list.
   * @returns {Promise<CheckListAccessOutput>} Their role, the space and the list.
   * @throws {SpaceRefusal} `organization-not-found` or `list-not-found`.
   */
  public async execute(input: CheckListAccessInput): Promise<CheckListAccessOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<CheckListAccessOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const list: TaskList | null = await store.lists.find(input.organizationId, input.listId);
      if (list === null) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      const space: Space | null = await store.spaces.find(
        input.organizationId,
        list.snapshot.spaceId,
      );
      if (space === null) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      const access: ViewerAccess = await this.access.resolve(
        store.grants,
        viewer,
        space.snapshot,
        list.snapshot,
      );
      if (access.listRole === null) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      return { role: access.listRole, spaceId: space.snapshot.id, listId: list.snapshot.id };
    });
  }
  // #endregion
}
