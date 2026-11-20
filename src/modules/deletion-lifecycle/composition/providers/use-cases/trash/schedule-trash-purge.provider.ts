import type { FactoryProvider } from '@nestjs/common';

import type { OrganizationsWithTrash } from '../../../../application/ports/outbound/tasks/trash/organizations-with-trash.port.js';
import type { TrashPurgeScheduleUnitOfWork } from '../../../../application/ports/outbound/transactions/trash/trash-purge-schedule-unit-of-work.port.js';
import { ScheduleTrashPurge } from '../../../../application/use-cases/commands/trash/schedule-trash-purge/schedule-trash-purge.use-case.js';
import { ORGANIZATIONS_WITH_TRASH } from '../../../tokens/trash/organizations-with-trash.token.js';
import { TRASH_PURGE_SCHEDULE_UNIT_OF_WORK } from '../../../tokens/trash/trash-purge-schedule-unit-of-work.token.js';

/**
 * Constant scheduleTrashPurgeProvider
 *
 * @description
 * Builds the work of the daily schedule on the read of the organizations with trash to erase (a
 * read-only system transaction of the tasks module) and the system unit of work that enqueues the
 * purge jobs of each page.
 *
 * @type {FactoryProvider<ScheduleTrashPurge>}
 */
export const scheduleTrashPurgeProvider: FactoryProvider<ScheduleTrashPurge> = {
  provide: ScheduleTrashPurge,
  inject: [ORGANIZATIONS_WITH_TRASH, TRASH_PURGE_SCHEDULE_UNIT_OF_WORK],
  useFactory: (
    organizations: OrganizationsWithTrash,
    unitOfWork: TrashPurgeScheduleUnitOfWork,
  ): ScheduleTrashPurge => new ScheduleTrashPurge(organizations, unitOfWork),
};
