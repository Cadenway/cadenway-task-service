import { ApprovalError } from '../../errors/approval/approval.error.js';

/**
 * Validates the Markdown used as the task comment for a change request without modifying it.
 * `components/approval.yaml` sets the nonblank 5,000 Unicode code-point limit.
 *
 * @throws {ApprovalError} When the comment cannot store the submitted reason.
 */
export function validateApprovalChangeReason(reason: string): void {
  if (!/\S/u.test(reason) || reason.includes('\0') || Array.from(reason).length > 5000) {
    throw new ApprovalError('invalid-reason');
  }
}
