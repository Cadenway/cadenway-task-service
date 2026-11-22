import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { AssertCanReplayTaskReceipt } from '../../../../application/use-cases/queries/task/assert-can-replay-task-receipt/assert-can-replay-task-receipt.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

export const assertCanReplayTaskReceiptProvider: FactoryProvider<AssertCanReplayTaskReceipt> = {
  provide: AssertCanReplayTaskReceipt,
  inject: [TASKS_UNIT_OF_WORK, MEMBER_DIRECTORY, SPACE_DIRECTORY],
  useFactory: (work: TasksUnitOfWork, members: MemberDirectory, spaces: SpaceDirectory) =>
    new AssertCanReplayTaskReceipt(work, members, spaces),
};
