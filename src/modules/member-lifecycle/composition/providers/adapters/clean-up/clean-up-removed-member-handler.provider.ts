import { JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import type { FactoryProvider } from '@nestjs/common';

import { CLEAN_UP_REMOVED_MEMBER_QUEUE } from '../../../../../../config/job-queues.js';
import type { PrivateSpaceHandover } from '../../../../application/ports/outbound/spaces/space/private-space-handover.port.js';
import { CleanUpRemovedMember } from '../../../../application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.use-case.js';
import { CleanUpRemovedMemberHandler } from '../../../../presentation/jobs/handlers/member-clean-up/clean-up-removed-member.handler.js';
import { PRIVATE_SPACE_HANDOVER } from '../../../tokens/space/private-space-handover.token.js';

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
  inject: [JobWorkerRegistry, CleanUpRemovedMember, PRIVATE_SPACE_HANDOVER],
  useFactory: (
    workers: JobWorkerRegistry,
    useCase: CleanUpRemovedMember,
    spaces: PrivateSpaceHandover,
  ): CleanUpRemovedMemberHandler =>
    new CleanUpRemovedMemberHandler(
      workers,
      useCase,
      CLEAN_UP_REMOVED_MEMBER_QUEUE,
      (organizationId) => spaces.handOverAwaiting(organizationId),
    ),
};
