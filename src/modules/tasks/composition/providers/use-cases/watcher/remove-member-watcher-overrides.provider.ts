import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { RemoveMemberWatcherOverrides } from '../../../../application/use-cases/commands/watcher/remove-member-watcher-overrides/remove-member-watcher-overrides.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Wires the batch cleanup of a former member's watcher overrides. */
export const removeMemberWatcherOverridesProvider: FactoryProvider<RemoveMemberWatcherOverrides> = {
  provide: RemoveMemberWatcherOverrides,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
  ): RemoveMemberWatcherOverrides => new RemoveMemberWatcherOverrides(unitOfWork, members),
};
