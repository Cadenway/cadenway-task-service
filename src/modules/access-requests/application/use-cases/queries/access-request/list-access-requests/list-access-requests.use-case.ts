import type { AccessRequest } from '../../../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { PendingScope } from '../../../../models/access-request/pending-scope.model.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';
import type { ManagedTargets } from '../../../../models/target/managed-targets.model.js';
import type { TaskReference } from '../../../../models/task/task-reference.model.js';
import type { AccessRequestsStore } from '../../../../models/transactions/access-requests-store.model.js';
import type { AccessRequestView } from '../../../../projections/access-request/access-request-view.projection.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { AccessTargets } from '../../../../ports/outbound/spaces/access/access-targets.port.js';
import type { TaskReferences } from '../../../../ports/outbound/tasks/task/task-references.port.js';
import type { AccessRequestsUnitOfWork } from '../../../../ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { AccessRequestViewBuilder } from '../../../../services/access-request/access-request-view-builder.service.js';
import { MemberRoleResolver } from '../../../../services/member/member-role-resolver.service.js';
import type { ListAccessRequestsInput } from './list-access-requests.input.js';
import type { ListAccessRequestsOutput } from './list-access-requests.output.js';

/**
 * Constant TASK_LOOKUP_CHUNK
 *
 * @description
 * The most task ids one call of `FindTaskReferences` of the tasks module takes.
 *
 * @type {number}
 */
const TASK_LOOKUP_CHUNK: number = 100;

/**
 * Class ListAccessRequests
 *
 * @description
 * The pending requests a member answers ("List the pending access requests" of
 * `openapi/public/access.yaml`), in one read-only tenant transaction:
 *
 * 1. the role of the actor from the copy of the memberships (`404 organization.not-found`);
 * 2. what they answer for, from the spaces module (`ListManagedAccessTargets`): the spaces they
 *    manage and the lists they have `edit` on;
 * 3. when they have `edit` on some list, the task requests they answer: the distinct tasks of the
 *    pending task requests of the organization, located where they are now with
 *    `FindTaskReferences` in chunks of 100, kept when their current list is one of those lists and
 *    when their current space and list match the `spaceId` and `listId` filters (a task request
 *    concerns the list the task is in now, not the one it was in when asked for);
 * 4. a page of the space requests of the spaces they manage, the list requests of the lists they
 *    have `edit` on and the task requests kept in step 3, the most recent first
 *    `(created_at desc, id desc)`, read with one request more than the page to know whether
 *    another follows, and their count (`total`, on every page).
 *
 * A member who answers nothing gets an empty page without reading the requests. Step 3 costs one
 * read of the pending task requests of the organization and one call of the tasks module per 100
 * distinct tasks, whatever the page: O(pending task requests of the organization), bounded by the
 * hourly limit of each requester and by the clean-up of the former members. Each statement reads
 * what was committed when it started.
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
   * The tasks module, which says where the tasks of the task requests are now.
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
        const tasks: ReadonlyMap<string, TaskReference> = await this.answerableTasks(
          store,
          input,
          managed.listIds,
        );
        const scope: PendingScope = {
          spaceIds: managed.spaceIds,
          listIds: managed.listIds,
          taskIds: [...tasks.keys()],
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
        return {
          items: page.map((request: AccessRequest): AccessRequestView => {
            const { taskId } = request.snapshot;
            const task: TaskReference | null = taskId === null ? null : (tasks.get(taskId) ?? null);
            return this.views.build(request, request.placement(task), task);
          }),
          next,
          total,
        };
      },
    );
  }

  /**
   * Method answerableTasks
   *
   * @description
   * The tasks of pending task requests that are now in a list the actor has `edit` on, and within
   * the filters, by id.
   *
   * @param {AccessRequestsStore} store - The store of the transaction.
   * @param {ListAccessRequestsInput} input - The actor and the filters.
   * @param {readonly string[]} listIds - The lists the actor has `edit` on.
   * @returns {Promise<ReadonlyMap<string, TaskReference>>} The tasks, where they are now.
   */
  private async answerableTasks(
    store: AccessRequestsStore,
    input: ListAccessRequestsInput,
    listIds: readonly string[],
  ): Promise<ReadonlyMap<string, TaskReference>> {
    const answerable: Map<string, TaskReference> = new Map<string, TaskReference>();
    if (listIds.length === 0) {
      return answerable;
    }
    const edited: ReadonlySet<string> = new Set<string>(listIds);
    const taskIds: readonly string[] = await store.requests.listPendingTaskIds(
      input.organizationId,
    );
    for (let start: number = 0; start < taskIds.length; start += TASK_LOOKUP_CHUNK) {
      const found: readonly TaskReference[] = await this.tasks.findByIds(
        input.organizationId,
        taskIds.slice(start, start + TASK_LOOKUP_CHUNK),
      );
      for (const task of found) {
        if (
          edited.has(task.listId) &&
          (input.spaceId === null || task.spaceId === input.spaceId) &&
          (input.listId === null || task.listId === input.listId)
        ) {
          answerable.set(task.id, task);
        }
      }
    }
    return answerable;
  }
  // #endregion
}
