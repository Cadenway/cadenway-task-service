import type { ApprovalOperations } from '../../../../services/approval/approval-operations.service.js';
import type { GetTaskApprovalInput } from './get-task-approval.input.js';
import type { GetTaskApprovalOutput } from './get-task-approval.output.js';

/** Reads the current approval visible to the caller. */
export class GetTaskApproval {
  // #region Constructor
  /** Binds the approval operations. */
  public constructor(private readonly operations: ApprovalOperations) {}
  // #endregion

  // #region Methods
  /** Runs the authorized operation. */
  public execute(input: GetTaskApprovalInput): Promise<GetTaskApprovalOutput> {
    return this.operations.read(input);
  }
  // #endregion
}
