import type { MemberEventStore } from '../../../../models/transactions/member-event-store.model.js';
import type { MembershipCopy } from '../../../../ports/outbound/members/membership/membership-copy.port.js';
import type { PrivateSpaceHandover } from '../../../../ports/outbound/spaces/space/private-space-handover.port.js';
import type { MemberEventUnitOfWork } from '../../../../ports/outbound/transactions/membership/member-event-unit-of-work.port.js';
import type { ApplyMemberEventInput } from './apply-member-event.input.js';
import type { ApplyMemberEventOutput } from './apply-member-event.output.js';

/**
 * Class ApplyMemberEvent
 *
 * @description
 * Applies a member event of organization-service to every module of this service it concerns:
 * the copy of the memberships for the three events, then, for `member.removed.v1`, the enqueuing
 * of the job that cleans up after the former member ("Members" of
 * `openapi/internal/task-service.yaml`): `CleanUpRemovedMember` hands their private spaces over
 * and unassigns them from their tasks afterwards, in batches.
 *
 * It owns its tenant transaction through `MemberEventUnitOfWork`, which joins the one the
 * deduplicator of the kit opened for the organization of the event, as the ports do. The copy, the
 * clean-up job (or, for an owner, the handed-over awaiting spaces with their outbox rows) and the
 * processed event id commit together, or none does and the kit redelivers the event. A removal
 * touches no space and no task, so its cost does not grow with what the member owned (decision
 * revised again by the coordinating session in PR 2 of P3a). Every effect is idempotent (the job
 * has one occurrence per membership and version), so a redelivery the deduplicator did not catch is
 * harmless.
 */
export class ApplyMemberEvent {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the event, joined to the one of the deduplicator.
   *
   * @type {MemberEventUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: MemberEventUnitOfWork;

  /**
   * Property memberships
   *
   * @description
   * The copy of the memberships.
   *
   * @type {MembershipCopy}
   * @readonly
   */
  private readonly memberships: MembershipCopy;

  /**
   * Property spaces
   *
   * @description
   * The handover of the spaces awaiting an owner.
   *
   * @type {PrivateSpaceHandover}
   * @readonly
   */
  private readonly spaces: PrivateSpaceHandover;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the unit of work and the two outbound ports.
   *
   * @param {MemberEventUnitOfWork} unitOfWork - The tenant transaction of the event.
   * @param {MembershipCopy} memberships - The copy of the memberships.
   * @param {PrivateSpaceHandover} spaces - The handover of the spaces awaiting an owner.
   * @constructor
   */
  public constructor(
    unitOfWork: MemberEventUnitOfWork,
    memberships: MembershipCopy,
    spaces: PrivateSpaceHandover,
  ) {
    this.unitOfWork = unitOfWork;
    this.memberships = memberships;
    this.spaces = spaces;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Applies the event to the copy, then:
   *
   * - for a removal, enqueues the clean-up job of the former member, once per membership and
   *   version; the job runs after the commit. The removal always commits;
   * - for a join or a role change that gives the role `owner`, hands the spaces awaiting an owner
   *   over to that owner, in the same transaction.
   *
   * The copy comes first, so the handover and the job read it after the event. A join or a role
   * change enqueues nothing: a member who becomes a guest keeps the tasks they hold.
   *
   * @param {ApplyMemberEventInput} input - The member event.
   * @returns {Promise<ApplyMemberEventOutput>} Whether a clean-up job was enqueued.
   * @throws {Error} When the copy, the handover or the enqueuing fails (the database, a lock
   * timeout): the transaction rolls back and the kit redelivers the event on the schedule of the
   * module.
   */
  public async execute(input: ApplyMemberEventInput): Promise<ApplyMemberEventOutput> {
    return this.unitOfWork.run(async (store: MemberEventStore): Promise<ApplyMemberEventOutput> => {
      await this.memberships.apply(input);
      if (input.kind === 'removed') {
        return {
          cleanUpEnqueued: await store.cleanUps.enqueue(
            input.userId,
            input.memberId,
            input.version,
          ),
        };
      }
      if (input.role === 'owner') {
        await this.spaces.handOverAwaiting(input.organizationId);
      }
      return { cleanUpEnqueued: false };
    });
  }
  // #endregion
}
