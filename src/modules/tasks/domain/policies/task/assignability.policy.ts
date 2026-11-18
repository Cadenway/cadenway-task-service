import { AssigneeInvalidError } from '../../errors/task/assignee-invalid.error.js';
import type { AssigneeCandidate } from '../../value-objects/member/assignee-candidate.value-object.js';
import type { MemberRole } from '../../value-objects/member/member-role.value-object.js';

/**
 * Function isAssignable
 *
 * @description
 * Whether an account may become an assignee: a current member of the organization other than a
 * guest, as the copy of the memberships holds it (`openapi/public/tasks.yaml:35-37`;
 * `TaskCreation.assigneeIds`, `openapi/internal/task-service.yaml:2419-2428`). Any other role
 * fails closed. A person already assigned who has become a guest since stays: this rule applies
 * to new assignees only (`openapi/public/tasks.yaml:1041-1043`;
 * `openapi/internal/task-service.yaml:70-71`).
 *
 * @param {MemberRole | null} role - The role in the copy, or `null` when it holds no membership.
 * @returns {boolean} Whether the account may be assigned.
 */
export function isAssignable(role: MemberRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}

/**
 * Function refuseUnassignable
 *
 * @description
 * Refuses, at the creation of a task, every account that may not be assigned, all named at once
 * (`openapi/public/tasks.yaml:115-116`; `details.userIds` of `task.assignee-invalid`).
 *
 * @param {readonly AssigneeCandidate[]} candidates - The accounts to assign with their role.
 * @throws {AssigneeInvalidError} With every refused account, each once, in the order sent.
 */
export function refuseUnassignable(candidates: readonly AssigneeCandidate[]): void {
  const refused: string[] = [];
  for (const candidate of candidates) {
    if (!isAssignable(candidate.role) && !refused.includes(candidate.userId)) {
      refused.push(candidate.userId);
    }
  }
  if (refused.length > 0) {
    throw new AssigneeInvalidError(refused);
  }
}
