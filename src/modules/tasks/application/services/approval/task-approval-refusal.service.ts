import { TaskApprovalTaskRefusal } from '../../models/approval/task-approval-task-refusal.model.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';

/** Converts task refusals at the approval module boundary while preserving unrelated errors. */
export function taskApprovalRefusal(error: unknown): unknown {
  if (!(error instanceof TaskRefusal)) return error;
  const refusal = error.refusal;
  switch (refusal.reason) {
    case 'role-insufficient':
      return new TaskApprovalTaskRefusal(refusal.reason, {
        role: refusal.role,
        requiredRole: refusal.requiredRole ?? 'edit',
      });
    case 'task-archived':
      return new TaskApprovalTaskRefusal(refusal.reason, { key: refusal.key });
    case 'task-trashed':
      return new TaskApprovalTaskRefusal(refusal.reason, { ...TaskRefusal.trashDetails(refusal) });
    case 'version-mismatch':
      return new TaskApprovalTaskRefusal(refusal.reason, { version: refusal.version });
    case 'status-hidden':
      return new TaskApprovalTaskRefusal(refusal.reason, { status: refusal.status });
    case 'assignee-invalid':
      return new TaskApprovalTaskRefusal(refusal.reason, { userIds: [...refusal.userIds] });
    case 'parent-invalid':
      return new TaskApprovalTaskRefusal(refusal.reason, { parentKey: refusal.parentKey });
    default:
      return new TaskApprovalTaskRefusal(refusal.reason);
  }
}
