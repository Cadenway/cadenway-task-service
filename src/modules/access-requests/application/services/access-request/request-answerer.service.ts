import type { AccessRequest } from '../../../domain/aggregates/access-request/access-request.aggregate.js';
import { AccessRequestDecidedError } from '../../../domain/errors/access-request/access-request-decided.error.js';
import type { MemberRole } from '../../../domain/value-objects/member/member-role.value-object.js';
import { AccessRequestRefusal } from '../../models/access-request/access-request-refusal.model.js';
import type { Caller } from '../../models/caller/caller.model.js';
import type { TargetAccess } from '../../models/target/target-access.model.js';
import type { TaskReference } from '../../models/task/task-reference.model.js';
import type { AccessRequestsStore } from '../../models/transactions/access-requests-store.model.js';
import type { AccessRequestView } from '../../projections/access-request/access-request-view.projection.js';
import type { AccessTargets } from '../../ports/outbound/spaces/access/access-targets.port.js';
import type { TaskReferences } from '../../ports/outbound/tasks/task/task-references.port.js';
import type { MemberRoleResolver } from '../member/member-role-resolver.service.js';
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
 * 3. whether the actor answers it: manages the space of a space request, has `edit` on the list of
 *    a list or a task request, as the spaces module says (`viewerManages`); a request the actor may
 *    not answer answers `404 access-request.not-found` like an unknown one, decided or not, so that
 *    a non-manager learns nothing;
 * 4. then the domain refuses a second answer (`409 access-request.already-decided`, with how).
 */
export class RequestAnswerer {
  // #region Properties
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
   * The tasks of the task requests.
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
   * @param {MemberRoleResolver} resolver - The role of the actor.
   * @param {AccessTargets} targets - The spaces module.
   * @param {TaskReferences} tasks - The tasks module.
   * @constructor
   */
  public constructor(resolver: MemberRoleResolver, targets: AccessTargets, tasks: TaskReferences) {
    this.resolver = resolver;
    this.targets = targets;
    this.tasks = tasks;
  }
  // #endregion

  // #region Methods
  /**
   * Method lockAnswerable
   *
   * @description
   * Locks a request the actor answers, pending or not.
   *
   * @param {AccessRequestsStore} store - The store of the transaction.
   * @param {Caller} caller - The organization and the actor.
   * @param {string} accessRequestId - The id of the path, in lower case.
   * @returns {Promise<AccessRequest>} The locked request.
   * @throws {AccessRequestRefusal} `organization-not-found`, or `access-request-not-found` when the
   * request is unknown or the actor does not answer its target.
   */
  public async lockAnswerable(
    store: AccessRequestsStore,
    caller: Caller,
    accessRequestId: string,
  ): Promise<AccessRequest> {
    const role: MemberRole = await this.resolver.resolve(
      caller.organizationId,
      caller.actorUserId,
      true,
    );
    const request: AccessRequest | null = await store.requests.lock(
      caller.organizationId,
      accessRequestId,
    );
    if (request === null) {
      throw new AccessRequestRefusal({ reason: 'access-request-not-found' });
    }
    const target: TargetAccess | null = await this.targets.find(
      caller.organizationId,
      caller.actorUserId,
      role,
      request.grantTarget,
    );
    if (target?.viewerManages !== true) {
      throw new AccessRequestRefusal({ reason: 'access-request-not-found' });
    }
    return request;
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
   * The answered request as the route answers it, with its task as it is now for a task request.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {AccessRequest} request - The request, answered.
   * @returns {Promise<AccessRequestView>} The view.
   */
  public async view(organizationId: string, request: AccessRequest): Promise<AccessRequestView> {
    const taskIds: readonly string[] = this.views.taskIdsOf([request]);
    const tasks: readonly TaskReference[] =
      taskIds.length === 0 ? [] : await this.tasks.findByIds(organizationId, taskIds);
    return this.views.build(request, tasks);
  }
  // #endregion
}
