import { JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import { CLEAN_UP_REMOVED_MEMBER_QUEUE } from '../../../../../../config/job-queues.js';
import { CleanUpRemovedMember } from '../../../../application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.use-case.js';
import { CleanUpRemovedMemberHandler } from '../../../../presentation/jobs/handlers/member-clean-up/clean-up-removed-member.handler.js';

/**
 * Constant cleanUpRemovedMemberHandlerProvider
 *
 * @description
 * Builds the worker of the clean-up jobs on its queue of `src/config/job-queues.ts`.
 *
 * @type {FactoryProvider<CleanUpRemovedMemberHandler>}
 */
export const cleanUpRemovedMemberHandlerProvider: FactoryProvider<CleanUpRemovedMemberHandler> = {
  provide: CleanUpRemovedMemberHandler,
  inject: [JobWorkerRegistry, CleanUpRemovedMember],
  useFactory: (
    workers: JobWorkerRegistry,
    useCase: CleanUpRemovedMember,
  ): CleanUpRemovedMemberHandler =>
    new CleanUpRemovedMemberHandler(workers, useCase, CLEAN_UP_REMOVED_MEMBER_QUEUE),
};
