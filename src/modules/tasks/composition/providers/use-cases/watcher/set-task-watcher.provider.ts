import type { FactoryProvider } from '@nestjs/common';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { SetTaskWatcher } from '../../../../application/use-cases/commands/watcher/set-task-watcher/set-task-watcher.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds the watcher write to the tenant transaction and authorization ports. */
export const setTaskWatcherProvider: FactoryProvider<SetTaskWatcher> = {
  provide: SetTaskWatcher,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (
    unit: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ): SetTaskWatcher => new SetTaskWatcher(unit, members, spaces),
};
