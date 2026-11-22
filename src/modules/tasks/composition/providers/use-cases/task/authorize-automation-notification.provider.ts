import type { FactoryProvider } from '@nestjs/common';

import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { DelegatedMemberships } from '../../../../application/use-cases/queries/member/delegated-memberships/delegated-memberships.use-case.js';
import { AuthorizeAutomationNotification } from '../../../../application/use-cases/queries/task/authorize-automation-notification/authorize-automation-notification.use-case.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds the current Automation notification proof to the two tenant directories. */
export const authorizeAutomationNotificationProvider: FactoryProvider<AuthorizeAutomationNotification> =
  {
    provide: AuthorizeAutomationNotification,
    inject: [TASKS_UNIT_OF_WORK, SPACE_DIRECTORY, DelegatedMemberships],
    useFactory: (
      unit: TasksUnitOfWork,
      spaces: SpaceDirectory,
      memberships: DelegatedMemberships,
    ): AuthorizeAutomationNotification =>
      new AuthorizeAutomationNotification(unit, spaces, memberships),
  };
