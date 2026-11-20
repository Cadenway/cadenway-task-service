import type { ApprovalDecided } from '../../../../../domain/events/approval/approval-decided.event.js';
import type { ApprovalRequested } from '../../../../../domain/events/approval/approval-requested.event.js';
import type { ApprovalTaskContext } from '../../../../models/approval/approval-task-context.model.js';

/** Records approval facts in the same tenant transaction as the task and round. */
export interface ApprovalEvents {
  // #region Methods
  /** Members of this contract. */
  requested(
    context: ApprovalTaskContext,
    actorUserId: string,
    event: ApprovalRequested,
  ): Promise<void>;
  decided(context: ApprovalTaskContext, actorUserId: string, event: ApprovalDecided): Promise<void>;
  // #endregion
}
