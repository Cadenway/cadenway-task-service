import type { ApprovalRound } from '../../../../../domain/aggregates/approval/approval-round.aggregate.js';

/** Approval records joined to the caller's tenant transaction. */
export interface ApprovalRepository {
  // #region Methods
  /** Members of this contract. */
  allocateId(): Promise<string>;
  findCurrent(organizationId: string, taskId: string): Promise<ApprovalRound | null>;
  replaceCurrent(round: ApprovalRound, closedAt: Date): Promise<void>;
  saveVote(round: ApprovalRound, reviewerUserId: string): Promise<boolean>;
  // #endregion
}
