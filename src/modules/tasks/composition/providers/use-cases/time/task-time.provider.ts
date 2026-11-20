import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { CreateTaskTimeEntry } from '../../../../application/use-cases/commands/time/create-task-time-entry/create-task-time-entry.use-case.js';
import { DeleteTaskTimeEntry } from '../../../../application/use-cases/commands/time/delete-task-time-entry/delete-task-time-entry.use-case.js';
import { GetTaskStatusDurations } from '../../../../application/use-cases/queries/time/get-task-status-durations/get-task-status-durations.use-case.js';
import { GetTaskTimeEntry } from '../../../../application/use-cases/queries/time/get-task-time-entry/get-task-time-entry.use-case.js';
import { GetTaskTimeSummary } from '../../../../application/use-cases/queries/time/get-task-time-summary/get-task-time-summary.use-case.js';
import { ListTaskTimeEntries } from '../../../../application/use-cases/queries/time/list-task-time-entries/list-task-time-entries.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

const useCases = [
  CreateTaskTimeEntry,
  DeleteTaskTimeEntry,
  GetTaskStatusDurations,
  GetTaskTimeEntry,
  GetTaskTimeSummary,
  ListTaskTimeEntries,
] as const;

/** Composes time use cases on the task transaction and access directories. */
export const taskTimeProviders: readonly FactoryProvider[] = useCases.map((UseCase) => ({
  provide: UseCase,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (work: TasksUnitOfWork, members: MemberDirectory, spaces: SpaceDirectory) =>
    new UseCase(work, members, spaces),
}));
