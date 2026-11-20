import type { FactoryProvider } from '@nestjs/common';

import { ResolveIntakePlacement } from '../../../../../spaces/public/intake/resolve-intake-placement.js';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { CreateIntakeTask } from '../../../../application/use-cases/commands/intake/create-intake-task/create-intake-task.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds ordinary system-actor task creation to the verified intake placement. */
export const createIntakeTaskProvider: FactoryProvider<CreateIntakeTask> = {
  provide: CreateIntakeTask,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, ResolveIntakePlacement, SPACE_DIRECTORY],
  useFactory: (
    work: TasksUnitOfWork,
    members: MemberDirectory,
    placement: ResolveIntakePlacement,
    spaces: SpaceDirectory,
  ): CreateIntakeTask =>
    new CreateIntakeTask(
      work,
      members,
      {
        lock: async (organizationId, listId) => {
          const target = await placement.execute({ organizationId, listId, lock: true });
          return target === null || target.archived
            ? null
            : { spaceId: target.spaceId, statuses: target.statuses };
        },
      },
      spaces,
    ),
};
