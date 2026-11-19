import type { AccessRequest } from '../../../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { PendingScope } from '../../../../models/access-request/pending-scope.model.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';
import type { ManagedTargets } from '../../../../models/target/managed-targets.model.js';
import type { TaskReference } from '../../../../models/task/task-reference.model.js';
import type { AccessRequestsStore } from '../../../../models/transactions/access-requests-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { AccessTargets } from '../../../../ports/outbound/spaces/access/access-targets.port.js';
import type { TaskReferences } from '../../../../ports/outbound/tasks/task/task-references.port.js';
import type { AccessRequestsUnitOfWork } from '../../../../ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { AccessRequestViewBuilder } from '../../../../services/access-request/access-request-view-builder.service.js';
import { MemberRoleResolver } from '../../../../services/member/member-role-resolver.service.js';
import type { ListAccessRequestsInput } from './list-access-requests.input.js';
import type { ListAccessRequestsOutput } from './list-access-requests.output.js';

/**
 * Class ListAccessRequests
 *
 * @description
 * The pending requests a member answers ("List the pending access requests" of
 * `openapi/public/access.yaml`), in one read-only tenant transaction:
 *
 * 1. the role of the actor from the copy of the memberships (`404 organization.not-found`);
 * 2. what they answer for, from the spaces module (`ListManagedAccessTargets`): the space requests
 *    of the spaces they manage, the list and task requests of the lists they have `edit` on (the
 *    list a task request stored, the list the task was in when asked for);
 * 3. a page of those requests, the most recent first `(created_at desc, id desc)`, read with one
 *    request more than the page to know whether another follows, and their count (`total`, on
 *    every page), narrowed by `spaceId` and `listId`;
 * 4. the tasks of the task requests of the page, as they are now, in one batch from the tasks
 *    module (`FindTaskReferences`).
 *
 * A member who answers nothing gets an empty page without reading the requests. The page and the
 * total are two statements, each read as committed when it started.
 */
export class ListAccessRequests {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The read-only tenant transaction of the reading.
   *
   * @type {AccessRequestsUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: AccessRequestsUnitOfWork;

  /**
   * Property resolver
   *
   * @description
   * The role of the actor, from the copy of the memberships.
   *
   * @type {MemberRoleResolver}
   * @readonly
   */
  private readonly resolver: MemberRoleResolver;

  /**
   * Property targets
   *
   * @description
   * The spaces module, which says what the actor answers for.
   *
   * @type {AccessTargets}
   * @readonly
   */
  private readonly targets: AccessTargets;

  /**
   * Property tasks
   *
   * @description
   * The tasks module, which names the tasks of the page.
   *
   * @type {TaskReferences}
   * @readonly
   */
  private readonly tasks: TaskReferences;

  /**
   * Property views
   *
   * @description
   * The builder of the views of the page.
   *
   * @type {AccessRequestViewBuilder}
   * @readonly
   */
  private readonly views: AccessRequestViewBuilder = new AccessRequestViewBuilder();
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the ports to the other modules.
   *
   * @param {AccessRequestsUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {AccessTargets} targets - The spaces module.
   * @param {TaskReferences} tasks - The tasks module.
   * @constructor
   */
  public constructor(
    unitOfWork: AccessRequestsUnitOfWork,
    members: MemberDirectory,
    targets: AccessTargets,
    tasks: TaskReferences,
  ) {
    this.unitOfWork = unitOfWork;
    this.resolver = new MemberRoleResolver(members);
    this.targets = targets;
    this.tasks = tasks;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads one page of the pending requests the actor answers.
   *
   * @param {ListAccessRequestsInput} input - The actor, the filters and the page.
   * @returns {Promise<ListAccessRequestsOutput>} The page.
   * @throws {AccessRequestRefusal} `organization-not-found`.
   */
  public async execute(input: ListAccessRequestsInput): Promise<ListAccessRequestsOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: AccessRequestsStore): Promise<ListAccessRequestsOutput> => {
        const { organizationId, actorUserId } = input;
        const role: MemberRole = await this.resolver.resolve(organizationId, actorUserId);
        const managed: ManagedTargets = await this.targets.listManaged(
          organizationId,
          actorUserId,
          role,
        );
        if (managed.spaceIds.length === 0 && managed.listIds.length === 0) {
          return { items: [], next: null, total: 0 };
        }
        const scope: PendingScope = {
          spaceIds: managed.spaceIds,
          listIds: managed.listIds,
          spaceId: input.spaceId,
          listId: input.listId,
        };
        const rows: readonly AccessRequest[] = await store.requests.listPending(
          organizationId,
          scope,
          input.after,
          input.limit + 1,
        );
        const total: number = await store.requests.countPending(organizationId, scope);
        const page: readonly AccessRequest[] = rows.slice(0, input.limit);
        const last: AccessRequest | undefined = page.at(-1);
        const next: PagePosition | null =
          rows.length > input.limit && last !== undefined
            ? { createdAt: last.snapshot.createdAt, id: last.snapshot.id }
            : null;
        const taskIds: readonly string[] = this.views.taskIdsOf(page);
        const tasks: readonly TaskReference[] =
          taskIds.length === 0 ? [] : await this.tasks.findByIds(organizationId, taskIds);
        return {
          items: page.map((request: AccessRequest) => this.views.build(request, tasks)),
          next,
          total,
        };
      },
    );
  }
  // #endregion
}
