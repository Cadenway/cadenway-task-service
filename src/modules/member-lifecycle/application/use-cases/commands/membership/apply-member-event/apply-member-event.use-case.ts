import type { MembershipCopy } from '../../../../ports/outbound/members/membership/membership-copy.port.js';
import type { PrivateSpaceHandover } from '../../../../ports/outbound/spaces/space/private-space-handover.port.js';
import type { MemberEventUnitOfWork } from '../../../../ports/outbound/transactions/membership/member-event-unit-of-work.port.js';
import type { ApplyMemberEventInput } from './apply-member-event.input.js';

/**
 * Class ApplyMemberEvent
 *
 * @description
 * Applies a member event of organization-service to every module of this service it concerns:
 * the copy of the memberships for the three events, then, for `member.removed.v1`, the hand-over
 * of the private spaces of the former member to the owner of the organization ("Members" of
 * `openapi/internal/task-service.yaml`).
 *
 * It owns its tenant transaction through `MemberEventUnitOfWork`, which joins the one the
 * deduplicator of the kit opened for the organization of the event, as both ports do. The copy, the handed-over
 * spaces with their outbox rows and the processed event id commit together, or none does and the
 * kit redelivers the event. Both effects are idempotent, so a redelivery the deduplicator did not
 * catch is harmless.
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
   * The hand-over of the private spaces.
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
   * @param {PrivateSpaceHandover} spaces - The hand-over of the private spaces.
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
   * Applies the event to the copy, then, for a removal, hands the private spaces of the former
   * member over. The copy comes first, so the hand-over runs once the copy no longer holds the
   * removed membership.
   *
   * @param {ApplyMemberEventInput} input - The member event.
   * @returns {Promise<void>} Resolves once every effect is applied.
   * @throws {Error} When the copy or the hand-over fails: the transaction rolls back and the kit
   * redelivers the event on the schedule of the module.
   */
  public async execute(input: ApplyMemberEventInput): Promise<void> {
    await this.unitOfWork.run(async (): Promise<void> => {
      await this.memberships.apply(input);
      if (input.kind === 'removed') {
        await this.spaces.handOver(input.organizationId, input.userId);
      }
    });
  }
  // #endregion
}
