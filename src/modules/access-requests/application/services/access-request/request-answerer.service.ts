import type { AccessRequest } from '../../../domain/aggregates/access-request/access-request.aggregate.js';
import { AccessRequestDecidedError } from '../../../domain/errors/access-request/access-request-decided.error.js';
import type { RequestPlacement } from '../../../domain/value-objects/access-request/request-placement.value-object.js';
import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';
import { AccessRequestRefusal } from '../../models/access-request/access-request-refusal.model.js';
import type { AnswerableRequest } from '../../models/access-request/answerable-request.model.js';
import type { Caller } from '../../models/caller/caller.model.js';
import type { TargetAccess } from '../../models/target/target-access.model.js';
import type { TaskReference } from '../../models/task/task-reference.model.js';
import type { AccessRequestsStore } from '../../models/transactions/access-requests-store.model.js';
import type { AccessRequestView } from '../../projections/access-request/access-request-view.projection.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';
import type { AccessTargets } from '../../ports/outbound/spaces/access/access-targets.port.js';
import type { TaskReferences } from '../../ports/outbound/tasks/task/task-references.port.js';
import { MemberRoleResolver } from '../member/member-role-resolver.service.js';
import { AccessRequestViewBuilder } from './access-request-view-builder.service.js';

/**
 * Class RequestAnswerer
 *
 * @description
 * What an approval and a refusal share ("Approve" and "Refuse an access request" of
 * `openapi/public/access.yaml`), inside their tenant transaction:
 *
 * 1. the membership of the actor, locked `FOR SHARE` (`404 organization.not-found`);
 * 2. the request, locked `FOR UPDATE`, so that two answers are serialized;
 * 3. the membership of the requester, without lock: a request whose requester left the
 *    organization answers `404 access-request.not-found` ("or one whose requester left" of
 *    `AccessRequestNotFound`), whether the clean-up has dropped it yet or not;
 * 4. for a task request, where the task is now (`FindTaskReferences`): a task no longer found
 *    answers `404 access-request.not-found`;
 * 5. whether the actor answers it, on where its target is now: manages the space of a space
 *    request, has `edit` on the list of a list request or on the current list of the task of a
 *    task request (`viewerManages`); a request the actor may not answer answers `404` like an
 *    unknown one, decided or not, so that a non-manager learns nothing;
 * 6. then the domain refuses a second answer (`409 access-request.already-decided`, with how).
 */
export class RequestAnswerer {
  // #region Properties
  /**
   * Property members
   *
   * @description
   * The copy of the memberships, for the requester.
   *
   * @type {MemberDirectory}
   * @readonly
   */
  private readonly members: MemberDirectory;

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
   * The tasks of the task requests, where they are now.
   *
   * @type {TaskReferences}
   * @readonly
   */
  private readonly tasks: TaskReferences;

  /**
   * Property views
   *
   * @description
   * The builder of the answer.
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
   * Takes the outbound ports.
   *
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {AccessTargets} targets - The spaces module.
   * @param {TaskReferences} tasks - The tasks module.
   * @constructor
   */
  public constructor(members: MemberDirectory, targets: AccessTargets, tasks: TaskReferences) {
    this.members = members;
    this.resolver = new MemberRoleResolver(members);
    this.targets = targets;
    this.tasks = tasks;
  }
  // #endregion

  // #region Methods
  /**
   * Method lockAnswerable
   *
   * @description
   * Locks a request the actor answers, pending or not, and places it where its target is now.
   *
   * @param {AccessRequestsStore} store - The store of the transaction.
   * @param {Caller} caller - The organization and the actor.
   * @param {string} accessRequestId - The id of the path, in lower case.
   * @returns {Promise<AnswerableRequest>} The locked request, its placement, its task and the role
   * of the actor.
   * @throws {AccessRequestRefusal} `organization-not-found`, or `access-request-not-found` when the
   * request is unknown, its requester left, its task is no longer found, or the actor does not
   * answer its target.
   */
  public async lockAnswerable(
    store: AccessRequestsStore,
    caller: Caller,
    accessRequestId: string,
  ): Promise<AnswerableRequest> {
    const { organizationId, actorUserId } = caller;
    const actorRole: MemberRole = await this.resolver.resolve(organizationId, actorUserId, true);
    const request: AccessRequest | null = await store.requests.lock(
      organizationId,
      accessRequestId,
    );
    if (request === null) {
      throw new AccessRequestRefusal({ reason: 'access-request-not-found' });
    }
    const { requesterUserId, taskId } = request.snapshot;
    if ((await this.members.roleOf(organizationId, requesterUserId)) === null) {
      throw new AccessRequestRefusal({ reason: 'access-request-not-found' });
    }
    let task: TaskReference | null = null;
    if (taskId !== null) {
      const found: readonly TaskReference[] = await this.tasks.findByIds(organizationId, [taskId]);
      task = found.find((candidate: TaskReference): boolean => candidate.id === taskId) ?? null;
      if (task === null) {
        throw new AccessRequestRefusal({ reason: 'access-request-not-found' });
      }
    }
    const placement: RequestPlacement = request.placement(task);
    // No lock: an approval locks the space or the list itself, in `GrantRequestedAccess`.
    const target: TargetAccess | null = await this.targets.find(
      organizationId,
      actorUserId,
      actorRole,
      request.grantTarget(placement),
      'none',
    );
    if (target?.viewerManages !== true) {
      throw new AccessRequestRefusal({ reason: 'access-request-not-found' });
    }
    return { request, placement, task, actorRole };
  }

  /**
   * Method answer
   *
   * @description
   * Applies an answer of the domain, turning a second answer into its refusal.
   *
   * @param {() => AccessRequest} decide - The call of `approve` or `refuse`.
   * @returns {AccessRequest} The request, answered.
   * @throws {AccessRequestRefusal} `already-decided`, with how it was answered first.
   */
  public answer(decide: () => AccessRequest): AccessRequest {
    try {
      return decide();
    } catch (error: unknown) {
      if (error instanceof AccessRequestDecidedError) {
        throw new AccessRequestRefusal({ reason: 'already-decided', status: error.status });
      }
      throw error;
    }
  }

  /**
   * Method view
   *
   * @description
   * The answered request as the route answers it, placed where its target is now, with its task
   * as it was read under the lock.
   *
   * @param {AccessRequest} answered - The request, answered.
   * @param {AnswerableRequest} answerable - What `lockAnswerable` read.
   * @returns {AccessRequestView} The view.
   */
  public view(answered: AccessRequest, answerable: AnswerableRequest): AccessRequestView {
    return this.views.build(answered, answerable.placement, answerable.task);
  }
  // #endregion
}
