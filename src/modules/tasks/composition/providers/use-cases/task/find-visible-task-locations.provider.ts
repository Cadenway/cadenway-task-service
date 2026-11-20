import type { FactoryProvider } from '@nestjs/common';

import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { FindVisibleTaskLocations } from '../../../../application/use-cases/queries/task/find-visible-task-locations/find-visible-task-locations.use-case.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Reuses the task snapshot and the canonical list access policy for bounded reads. */
export const findVisibleTaskLocationsProvider: FactoryProvider<FindVisibleTaskLocations> = {
  provide: FindVisibleTaskLocations,
  inject: [TASKS_UNIT_OF_WORK, SPACE_DIRECTORY],
  useFactory: (work: TasksUnitOfWork, spaces: SpaceDirectory): FindVisibleTaskLocations =>
    new FindVisibleTaskLocations(work, spaces),
};
