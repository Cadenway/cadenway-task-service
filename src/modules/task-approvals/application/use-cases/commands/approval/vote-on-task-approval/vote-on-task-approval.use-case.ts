import type { ApprovalOperations } from '../../../../services/approval/approval-operations.service.js';
import type { VoteOnTaskApprovalInput } from './vote-on-task-approval.input.js';
import type { VoteOnTaskApprovalOutput } from './vote-on-task-approval.output.js';

/** Records an eligible reviewer's decision. */
export class VoteOnTaskApproval {
  // #region Constructor
  /** Binds the approval operations. */
  public constructor(private readonly operations: ApprovalOperations) {}
  // #endregion

  // #region Methods
  /** Runs the authorized operation. */
  public execute(input: VoteOnTaskApprovalInput): Promise<VoteOnTaskApprovalOutput> {
    return this.operations.vote(input);
  }
  // #endregion
}
