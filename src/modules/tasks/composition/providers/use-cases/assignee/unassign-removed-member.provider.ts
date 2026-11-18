import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { UnassignRemovedMember } from '../../../../application/use-cases/commands/assignee/unassign-removed-member/unassign-removed-member.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/**
 * Constant unassignRemovedMemberProvider
 *
 * @description
 * Builds the removal of a former member from every task they were assigned to, which member-lifecycle runs in the tenant transaction of the removal event on the tenant unit of work of the module, the member directory, which reads the
 * role of the actor in the same transaction.
 *
 * @type {FactoryProvider<UnassignRemovedMember>}
 */
export const unassignRemovedMemberProvider: FactoryProvider<UnassignRemovedMember> = {
  provide: UnassignRemovedMember,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: TasksUnitOfWork, members: MemberDirectory): UnassignRemovedMember =>
    new UnassignRemovedMember(unitOfWork, members),
};
