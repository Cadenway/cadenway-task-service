import type { ApprovalActor } from '../../../../models/approval/approval-actor.model.js';

/** An eligible reviewer's decision for the current round. */
export type VoteOnTaskApprovalInput = ApprovalActor & {
  readonly expectedVersions: readonly number[] | null;
  readonly roundId: string;
  readonly vote:
    | { readonly decision: 'approved' }
    | {
        readonly decision: 'changes-requested';
        readonly reason: string;
      };
};
