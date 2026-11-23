import type { FactoryProvider } from '@nestjs/common';

import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { DelegatedMemberships } from '../../../../application/use-cases/queries/member/delegated-memberships/delegated-memberships.use-case.js';
import { GetTaskVisibility } from '../../../../application/use-cases/queries/task/get-task-visibility/get-task-visibility.use-case.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds the current membership proof and canonical list reads to the tenant snapshot. */
export const getTaskVisibilityProvider: FactoryProvider<GetTaskVisibility> = {
  provide: GetTaskVisibility,
  inject: [TASKS_UNIT_OF_WORK, DelegatedMemberships, SPACE_DIRECTORY],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    memberships: DelegatedMemberships,
    spaces: SpaceDirectory,
  ): GetTaskVisibility => new GetTaskVisibility(unitOfWork, memberships, spaces),
};
