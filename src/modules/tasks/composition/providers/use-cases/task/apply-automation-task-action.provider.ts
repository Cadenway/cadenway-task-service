import type { FactoryProvider } from '@nestjs/common';

import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { DelegatedMemberships } from '../../../../application/use-cases/queries/member/delegated-memberships/delegated-memberships.use-case.js';
import { ApplyAutomationTaskAction } from '../../../../application/use-cases/commands/task/apply-automation-task-action/apply-automation-task-action.use-case.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds Automation actions to tenant persistence and current Task authorities. */
export const applyAutomationTaskActionProvider: FactoryProvider<ApplyAutomationTaskAction> = {
  provide: ApplyAutomationTaskAction,
  inject: [TASKS_UNIT_OF_WORK, SPACE_DIRECTORY, DelegatedMemberships],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    spaces: SpaceDirectory,
    memberships: DelegatedMemberships,
  ): ApplyAutomationTaskAction => new ApplyAutomationTaskAction(unitOfWork, spaces, memberships),
};
