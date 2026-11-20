import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TaskDependencyMutations } from '../../../../application/services/dependency/task-dependency-mutations.service.js';
import { TaskDependencyReads } from '../../../../application/services/dependency/task-dependency-reads.service.js';
import { CreateTaskDependency } from '../../../../application/use-cases/commands/dependency/create-task-dependency/create-task-dependency.use-case.js';
import { DeleteTaskDependency } from '../../../../application/use-cases/commands/dependency/delete-task-dependency/delete-task-dependency.use-case.js';
import { GetTaskDependency } from '../../../../application/use-cases/queries/dependency/get-task-dependency/get-task-dependency.use-case.js';
import { ListDependencyCandidates } from '../../../../application/use-cases/queries/dependency/list-dependency-candidates/list-dependency-candidates.use-case.js';
import { ListTaskDependencies } from '../../../../application/use-cases/queries/dependency/list-task-dependencies/list-task-dependencies.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Composes the dependency use cases on the existing task transaction and directories. */
export const taskDependencyProviders: readonly FactoryProvider[] = [
  {
    provide: TaskDependencyMutations,
    inject: [MEMBER_DIRECTORY, SPACE_DIRECTORY],
    useFactory: (members: MemberDirectory, spaces: SpaceDirectory): TaskDependencyMutations =>
      new TaskDependencyMutations(members, spaces),
  },
  {
    provide: TaskDependencyReads,
    inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
    useFactory: (
      work: TasksUnitOfWork,
      members: MemberDirectory,
      spaces: SpaceDirectory,
    ): TaskDependencyReads => new TaskDependencyReads(work, members, spaces),
  },
  {
    provide: CreateTaskDependency,
    inject: [TASKS_UNIT_OF_WORK, TaskDependencyMutations],
    useFactory: (work: TasksUnitOfWork, mutations: TaskDependencyMutations): CreateTaskDependency =>
      new CreateTaskDependency(work, mutations),
  },
  {
    provide: DeleteTaskDependency,
    inject: [TASKS_UNIT_OF_WORK, TaskDependencyMutations],
    useFactory: (work: TasksUnitOfWork, mutations: TaskDependencyMutations): DeleteTaskDependency =>
      new DeleteTaskDependency(work, mutations),
  },
  {
    provide: GetTaskDependency,
    inject: [TaskDependencyReads],
    useFactory: (reads: TaskDependencyReads): GetTaskDependency => new GetTaskDependency(reads),
  },
  {
    provide: ListTaskDependencies,
    inject: [TaskDependencyReads],
    useFactory: (reads: TaskDependencyReads): ListTaskDependencies =>
      new ListTaskDependencies(reads),
  },
  {
    provide: ListDependencyCandidates,
    inject: [TaskDependencyReads],
    useFactory: (reads: TaskDependencyReads): ListDependencyCandidates =>
      new ListDependencyCandidates(reads),
  },
];
