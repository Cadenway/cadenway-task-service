import type { ApplyMemberEventInput } from '../../use-cases/commands/membership/apply-member-event/apply-member-event.input.js';

/** A membership supplied by the source of record, carrying the time of its current version. */
export interface MembershipRebuildItem {
  // #region Properties
  /** Organization that owns the membership. */
  readonly organizationId: string;

  /** Stable membership generation. */
  readonly memberId: string;

  /** Account bound to the generation. */
  readonly userId: string;

  /** Recognized role in the source of record. */
  readonly role: ApplyMemberEventInput['role'];

  /** The last applied version of the generation. */
  readonly version: number;

  /** Terminal removal time, if removed. */
  readonly removedAt: Date | null;

  /** Source time of the current version. */
  readonly updatedAt: Date;
  // #endregion
}
