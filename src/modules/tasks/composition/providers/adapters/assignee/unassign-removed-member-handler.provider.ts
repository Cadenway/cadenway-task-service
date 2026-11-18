import { JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import { UNASSIGN_REMOVED_MEMBER_QUEUE } from '../../../../../../config/job-queues.js';
import { UnassignRemovedMember } from '../../../../application/use-cases/commands/assignee/unassign-removed-member/unassign-removed-member.use-case.js';
import { UnassignRemovedMemberHandler } from '../../../../presentation/jobs/handlers/member-unassignment/unassign-removed-member.handler.js';

/**
 * Constant unassignRemovedMemberHandlerProvider
 *
 * @description
 * Builds the worker of the unassignment jobs on its queue of `src/config/job-queues.ts`.
 *
 * @type {FactoryProvider<UnassignRemovedMemberHandler>}
 */
export const unassignRemovedMemberHandlerProvider: FactoryProvider<UnassignRemovedMemberHandler> = {
  provide: UnassignRemovedMemberHandler,
  inject: [JobWorkerRegistry, UnassignRemovedMember],
  useFactory: (
    workers: JobWorkerRegistry,
    useCase: UnassignRemovedMember,
  ): UnassignRemovedMemberHandler =>
    new UnassignRemovedMemberHandler(workers, useCase, UNASSIGN_REMOVED_MEMBER_QUEUE),
};
