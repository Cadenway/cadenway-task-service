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
import type { GetListInput } from './get-list.input.js';
import type { GetListOutput } from './get-list.output.js';

/**
 * Class GetList
 *
 * @description
 * Reads one list or sprint (`GET /internal/v1/lists/{listId}`) with the effective role of the actor
 * on it (`listRoleOf`, decision 2 of P3b-1). A list that does not exist and a list the actor has no
 * role on (its space private to another, its switch "Accès de l’organisation" off and not shared
 * with them, a guest without its grant) get the same answer, `list-not-found`. An archived list
 * reads by its id with its archive ("Lists" of `openapi/public/archives.yaml`). It runs in one
 * tenant transaction, scoped to the organization of the context; the grants of the actor are read
 * in one statement when the rule of the organization does not already give `edit`.
 */
export class GetList {
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
   * Decides what the actor reaches of the list.
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
   * Reads the list.
   *
   * @param {GetListInput} input - The actor and the list.
   * @returns {Promise<GetListOutput>} The list and the role of the actor.
   * @throws {SpaceRefusal} `organization-not-found` or `list-not-found`.
   */
  public async execute(input: GetListInput): Promise<GetListOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<GetListOutput> => {
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
      return { list: list.snapshot, callerRole: access.listRole };
    });
  }
  // #endregion
}
