import type { ApprovalOperations } from '../../../../services/approval/approval-operations.service.js';
import type { WithdrawTaskApprovalVoteInput } from './withdraw-task-approval-vote.input.js';
import type { WithdrawTaskApprovalVoteOutput } from './withdraw-task-approval-vote.output.js';

/** Withdraws a vote without changing the task status. */
export class WithdrawTaskApprovalVote {
  // #region Constructor
  /** Binds the approval operations. */
  public constructor(private readonly operations: ApprovalOperations) {}
  // #endregion

  // #region Methods
  /** Runs the authorized operation. */
  public execute(input: WithdrawTaskApprovalVoteInput): Promise<WithdrawTaskApprovalVoteOutput> {
    return this.operations.withdraw(input);
  }
  // #endregion
}
