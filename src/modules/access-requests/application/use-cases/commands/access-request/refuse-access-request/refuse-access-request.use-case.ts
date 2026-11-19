import type { AccessRequest } from '../../../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { AccessRequestsStore } from '../../../../models/transactions/access-requests-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { AccessTargets } from '../../../../ports/outbound/spaces/access/access-targets.port.js';
import type { TaskReferences } from '../../../../ports/outbound/tasks/task/task-references.port.js';
import type { AccessRequestsUnitOfWork } from '../../../../ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { RequestAnswerer } from '../../../../services/access-request/request-answerer.service.js';
import { MemberRoleResolver } from '../../../../services/member/member-role-resolver.service.js';
import type { RefuseAccessRequestInput } from './refuse-access-request.input.js';
import type { RefuseAccessRequestOutput } from './refuse-access-request.output.js';

/**
 * Class RefuseAccessRequest
 *
 * @description
 * Refuses a pending request ("Refuse an access request" of `openapi/public/access.yaml`), in one
 * tenant transaction: the checks of `RequestAnswerer` (membership, request locked `FOR UPDATE`, the
 * actor answers its target, still pending), then the answer is stored and
 * `…access-request-decided.v1` appended (`decision: 'refused'`, `role: null`). Nothing else
 * changes: no grant is touched.
 */
export class RefuseAccessRequest {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the refusal.
   *
   * @type {AccessRequestsUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: AccessRequestsUnitOfWork;

  /**
   * Property answerer
   *
   * @description
   * The checks and the answer a refusal shares with an approval.
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
    this.answerer = new RequestAnswerer(new MemberRoleResolver(members), targets, tasks);
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Refuses the request.
   *
   * @param {RefuseAccessRequestInput} input - The actor and the request.
   * @returns {Promise<RefuseAccessRequestOutput>} The request, refused.
   * @throws {AccessRequestRefusal} `organization-not-found`, `access-request-not-found` or
   * `already-decided`.
   */
  public async execute(input: RefuseAccessRequestInput): Promise<RefuseAccessRequestOutput> {
    return this.unitOfWork.run(
      async (store: AccessRequestsStore): Promise<RefuseAccessRequestOutput> => {
        const request: AccessRequest = await this.answerer.lockAnswerable(
          store,
          input,
          input.accessRequestId,
        );
        const now: Date = await store.clock.now();
        const refused: AccessRequest = this.answerer.answer(() =>
          request.refuse({ type: 'user', id: input.actorUserId }, now),
        );
        await store.requests.saveDecision(refused);
        await store.events.accessRequestDecided(refused);
        return this.answerer.view(input.organizationId, refused);
      },
    );
  }
  // #endregion
}
