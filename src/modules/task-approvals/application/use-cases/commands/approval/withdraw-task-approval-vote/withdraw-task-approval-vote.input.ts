import type { ApprovalActor } from '../../../../models/approval/approval-actor.model.js';

/** Removes the caller's vote in the current round. */
export type WithdrawTaskApprovalVoteInput = ApprovalActor & {
  readonly expectedVersions: readonly number[] | null;
  readonly roundId: string;
};
