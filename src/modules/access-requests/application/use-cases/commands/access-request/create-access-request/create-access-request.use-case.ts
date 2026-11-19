import { AccessRequest } from '../../../../../domain/aggregates/access-request/access-request.aggregate.js';
import { isRequestStored } from '../../../../../domain/policies/access-request/access-request-storage.policy.js';
import {
  ACCESS_REQUEST_LIMIT,
  checkRequestQuota,
  quotaWindowStart,
} from '../../../../../domain/policies/quota/access-request-quota.policy.js';
import type { AccessRequestDraft } from '../../../../../domain/value-objects/access-request/access-request-draft.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { QuotaVerdict } from '../../../../../domain/value-objects/quota/quota-verdict.value-object.js';
import { AccessRequestRefusal } from '../../../../models/access-request/access-request-refusal.model.js';
import type { TargetAccess } from '../../../../models/target/target-access.model.js';
import type { TaskReference } from '../../../../models/task/task-reference.model.js';
import type { AccessRequestsStore } from '../../../../models/transactions/access-requests-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { AccessTargets } from '../../../../ports/outbound/spaces/access/access-targets.port.js';
import type { TaskReferences } from '../../../../ports/outbound/tasks/task/task-references.port.js';
import type { AccessRequestsUnitOfWork } from '../../../../ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { MemberRoleResolver } from '../../../../services/member/member-role-resolver.service.js';
import type { CreateAccessRequestInput } from './create-access-request.input.js';

/**
 * Constant NO_LIST
 *
 * @description
 * A list id no list has (`uuidv7()` never gives the nil UUID): the target read for a task key the
 * organization does not hold, so that an unknown key costs the same calls as a known one.
 *
 * @type {string}
 */
const NO_LIST: string = '00000000-0000-0000-0000-000000000000';

/** The target of a request as the other modules resolved it. */
interface ResolvedTarget {
  // #region Properties
  /** The space or the list whose role decides, `null` when the organization has none. */
  readonly target: TargetAccess | null;

  /** The task of a task request, `null` otherwise or when the key is unknown. */
  readonly task: TaskReference | null;
  // #endregion
}

/**
 * Class CreateAccessRequest
 *
 * @description
 * "Demander l’accès" (`POST /internal/v1/access-requests`, decision 4 of P3b-1, "Access requests"
 * of `openapi/public/access.yaml`), in one tenant transaction:
 *
 * 1. the membership of the actor, locked `FOR SHARE` (`404 organization.not-found`), so that a
 *    removal committing meanwhile waits and its clean-up job sees the request;
 * 2. a transaction-level advisory lock on the organization and the actor, which serializes the
 *    requests of one requester: the count, the insert and the uniqueness see each other;
 * 3. the hourly limit: the attempts of the last hour (the clock of the database), refused at the
 *    eleventh (`429 access-request.limit-reached`, rolled back, so the refused attempt counts for
 *    nothing); otherwise the attempts that left the hour are deleted and this one is recorded,
 *    stored or not;
 * 4. the target: a space or a list through the spaces module, a task through the tasks module then
 *    its list through the spaces module;
 * 5. one insert statement, always: it stores the request only when `isRequestStored` says so,
 *    once per requester and target while pending; a stored request appends its
 *    `…access-requested.v1`.
 *
 * It always resolves the same way, whatever the target: the route answers `202` with no body, and
 * the statements of steps 1 to 5 are the same for every outcome, so neither the answer nor the
 * statements tell whether the target exists, is seen already or is asked for already. The one
 * difference left is the outbox append of a stored request.
 */
export class CreateAccessRequest {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the request.
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
   * The spaces and lists, with the access of the actor.
   *
   * @type {AccessTargets}
   * @readonly
   */
  private readonly targets: AccessTargets;

  /**
   * Property tasks
   *
   * @description
   * The tasks, by key.
   *
   * @type {TaskReferences}
   * @readonly
   */
  private readonly tasks: TaskReferences;
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
   * Takes a request for access, and stores it when the rules say so.
   *
   * @param {CreateAccessRequestInput} input - The actor, the target and the message.
   * @returns {Promise<void>} Resolves the same way whether the request was stored or not.
   * @throws {AccessRequestRefusal} `organization-not-found`, or `limit-reached` with when the next
   * request is possible.
   */
  public async execute(input: CreateAccessRequestInput): Promise<void> {
    await this.unitOfWork.run(async (store: AccessRequestsStore): Promise<void> => {
      const { organizationId, actorUserId } = input;
      const role: MemberRole = await this.resolver.resolve(organizationId, actorUserId, true);
      await store.attempts.serialize(organizationId, actorUserId);
      const now: Date = await store.clock.now();
      const windowStart: Date = quotaWindowStart(now);
      const attempts: readonly Date[] = await store.attempts.recent(
        organizationId,
        actorUserId,
        windowStart,
        ACCESS_REQUEST_LIMIT,
      );
      const verdict: QuotaVerdict = checkRequestQuota(attempts, now);
      if (!verdict.allowed) {
        throw new AccessRequestRefusal({
          reason: 'limit-reached',
          nextAvailableAt: verdict.nextAvailableAt,
          retryAfterSeconds: verdict.retryAfterSeconds,
        });
      }
      await store.attempts.prune(organizationId, actorUserId, windowStart);
      await store.attempts.record(organizationId, actorUserId);

      const { target, task }: ResolvedTarget = await this.resolveTarget(input, role);
      const stored: boolean = isRequestStored({
        target: input.target.kind,
        targetFound: target !== null && (input.target.kind !== 'task' || task !== null),
        requesterRole: role,
        roleOnTarget: target === null ? null : target.viewerRole,
      });
      const draft: AccessRequestDraft | null =
        stored && target !== null
          ? AccessRequest.ask({
              organizationId,
              target: input.target.kind,
              spaceId: target.spaceId,
              listId: input.target.kind === 'space' ? null : target.listId,
              taskId: task === null ? null : task.id,
              taskKey: task === null ? null : task.key,
              requesterUserId: actorUserId,
              message: input.message,
            })
          : null;
      // The insert runs whether there is a request to store or not, so that its statements are the
      // same for every outcome.
      const request: AccessRequest | null = await store.requests.insertPending(
        organizationId,
        actorUserId,
        draft,
      );
      if (request === null || target === null) {
        return;
      }
      await store.events.accessRequested(request, {
        spaceName: target.spaceName,
        spaceOwnerUserId: target.spaceOwnerUserId,
        listName: input.target.kind === 'space' ? null : target.listName,
        taskName: task === null ? null : task.name,
      });
    });
  }

  /**
   * Method resolveTarget
   *
   * @description
   * Reads the target and the role of the actor on it: the space, the list, or the list of the task,
   * the list the task is in now. An unknown key still reads a list, one that cannot exist, so that
   * it costs the same calls as a known one.
   *
   * @param {CreateAccessRequestInput} input - The request.
   * @param {MemberRole} role - The role of the actor in the organization.
   * @returns {Promise<ResolvedTarget>} The target and the task, each `null` when not found.
   */
  private async resolveTarget(
    input: CreateAccessRequestInput,
    role: MemberRole,
  ): Promise<ResolvedTarget> {
    const { organizationId, actorUserId } = input;
    switch (input.target.kind) {
      case 'space':
        return {
          target: await this.targets.find(organizationId, actorUserId, role, {
            kind: 'space',
            spaceId: input.target.spaceId,
          }),
          task: null,
        };
      case 'list':
        return {
          target: await this.targets.find(organizationId, actorUserId, role, {
            kind: 'list',
            listId: input.target.listId,
          }),
          task: null,
        };
      case 'task': {
        const task: TaskReference | null = await this.tasks.findByKey(
          organizationId,
          input.target.taskKey,
        );
        const target: TargetAccess | null = await this.targets.find(
          organizationId,
          actorUserId,
          role,
          { kind: 'list', listId: task === null ? NO_LIST : task.listId },
        );
        return { target: task === null ? null : target, task };
      }
    }
  }
  // #endregion
}
