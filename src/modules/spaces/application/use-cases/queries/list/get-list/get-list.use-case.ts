import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { GetListInput } from './get-list.input.js';
import type { GetListOutput } from './get-list.output.js';

/**
 * Class GetList
 *
 * @description
 * Reads one list or sprint (`GET /internal/v1/lists/{listId}`). A list is seen by whoever sees its
 * space: a list that does not exist and a list of a space the actor does not see get the same
 * answer, `list-not-found`. It runs in one tenant transaction, scoped to the organization of the
 * context.
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
   * Reads the list.
   *
   * @param {GetListInput} input - The actor and the list.
   * @returns {Promise<GetListOutput>} The list.
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
      if (!space?.isVisibleTo(viewer)) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      return list.snapshot;
    });
  }
  // #endregion
}
