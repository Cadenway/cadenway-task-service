import type { AccessRequest } from '../../../../../domain/aggregates/access-request/access-request.aggregate.js';
import { AccessRequestRefusal } from '../../../../models/access-request/access-request-refusal.model.js';
import type { AccessRequestRefusalReason } from '../../../../models/access-request/access-request-refusal-reason.model.js';
import type { AnswerableRequest } from '../../../../models/access-request/answerable-request.model.js';
import type { GrantOutcome } from '../../../../models/grant/grant-outcome.model.js';
import type { AccessRequestsStore } from '../../../../models/transactions/access-requests-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { AccessTargets } from '../../../../ports/outbound/spaces/access/access-targets.port.js';
import type { TaskReferences } from '../../../../ports/outbound/tasks/task/task-references.port.js';
import type { AccessRequestsUnitOfWork } from '../../../../ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { RequestAnswerer } from '../../../../services/access-request/request-answerer.service.js';
import type { ApproveAccessRequestInput } from './approve-access-request.input.js';
import type { ApproveAccessRequestOutput } from './approve-access-request.output.js';

/**
 * Function refusalOf
 *
 * @description
 * The refusal of an approval whose grant a rule of the grants refused, with the codes of the grant
 * routes (`GrantRefused` of `openapi/internal/task-service.yaml`): a space or a list that no longer
 * exists, and a target the actor no longer manages on the locked rows, answer like a request the
 * actor may not answer.
 *
 * @param {Extract<GrantOutcome, { outcome: 'refused' }>['reason']} reason - Why the spaces module
 * refused the grant.
 * @param {string} granteeUserId - The requester.
 * @returns {AccessRequestRefusalReason} The refusal of the route.
 */
function refusalOf(
  reason: Extract<GrantOutcome, { outcome: 'refused' }>['reason'],
  granteeUserId: string,
): AccessRequestRefusalReason {
  switch (reason) {
    case 'not-found':
    case 'manage-forbidden':
      return { reason: 'access-request-not-found' };
    case 'grantee-invalid':
      return { reason: 'grantee-invalid', userId: granteeUserId };
    case 'guest-space-forbidden':
      return { reason: 'guest-space-forbidden' };
    case 'owner-unchangeable':
      return { reason: 'owner-unchangeable' };
    case 'grant-limit-reached':
      return { reason: 'grant-limit-reached' };
  }
}

/**
 * Class ApproveAccessRequest
 *
 * @description
 * Approves a pending request with a role ("Approve an access request" of
 * `openapi/public/access.yaml`), in one tenant transaction: the checks of `RequestAnswerer`
 * (membership, request locked `FOR UPDATE`, requester still a member, task still found, the actor
 * answers its target where it is now, still pending), then the grant through
 * `GrantRequestedAccess` of the spaces module, with the role of the actor, on the space of a space
 * request, the list of a list request and the current list of the task of a task request. The
 * grant raises and never lowers: a lower grant is raised, an equal or higher one is kept, and the
 * request still records the role the approval gave. A grant the rules refuse answers their `422`,
 * or `404 access-request.not-found` when the space or the list no longer exists or the actor no
 * longer manages it on the locked rows, and rolls everything back. Then the answer is stored and
 * `…access-request-decided.v1` appended, naming where the target is now, after the
 * `space.access-changed.v1` or `list.access-changed.v1` of the grant when it changed.
 */
export class ApproveAccessRequest {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the approval.
   *
   * @type {AccessRequestsUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: AccessRequestsUnitOfWork;

  /**
   * Property targets
   *
   * @description
   * The spaces module, which gives the grant.
   *
   * @type {AccessTargets}
   * @readonly
   */
  private readonly targets: AccessTargets;

  /**
   * Property answerer
   *
   * @description
   * The checks and the answer an approval shares with a refusal.
   *
   * @type {RequestAnswerer}
   * @readonly
   */
  private readonly answerer: RequestAnswerer;
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
    this.targets = targets;
    this.answerer = new RequestAnswerer(members, targets, tasks);
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Approves the request and gives its grant.
   *
   * @param {ApproveAccessRequestInput} input - The actor, the request and the role.
   * @returns {Promise<ApproveAccessRequestOutput>} The request, approved.
   * @throws {AccessRequestRefusal} `organization-not-found`, `access-request-not-found`,
   * `already-decided`, or a refusal of the grant.
   */
  public async execute(input: ApproveAccessRequestInput): Promise<ApproveAccessRequestOutput> {
    return this.unitOfWork.run(
      async (store: AccessRequestsStore): Promise<ApproveAccessRequestOutput> => {
        const answerable: AnswerableRequest = await this.answerer.lockAnswerable(
          store,
          input,
          input.accessRequestId,
        );
        const { request, placement } = answerable;
        const now: Date = await store.clock.now();
        const approved: AccessRequest = this.answerer.answer(() =>
          request.approve(input.role, { type: 'user', id: input.actorUserId }, now),
        );
        const granteeUserId: string = request.snapshot.requesterUserId;
        const outcome: GrantOutcome = await this.targets.grant({
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          actorRole: answerable.actorRole,
          target: request.grantTarget(placement),
          granteeUserId,
          role: input.role,
        });
        if (outcome.outcome === 'refused') {
          throw new AccessRequestRefusal(refusalOf(outcome.reason, granteeUserId));
        }
        await store.requests.saveDecision(approved);
        await store.events.accessRequestDecided(approved, placement);
        return this.answerer.view(approved, answerable);
      },
    );
  }
  // #endregion
}
