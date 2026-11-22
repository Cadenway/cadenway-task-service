import type { ExecutionContext, FactoryProvider } from '@nestjs/common';

import { currentMembershipCheck } from '../../../../../../infrastructure/http/current-membership.js';
import { ReadCurrentMembership } from '../../../../../organization-members/public/membership/read-current-membership.js';
import { CurrentMembershipGuard } from '../../../../presentation/http/guards/access-request/current-membership.guard.js';

/** Uses Organization as the request's current membership authority. */
export const currentMembershipProvider: FactoryProvider<
  (context: ExecutionContext) => Promise<boolean>
> = {
  provide: CurrentMembershipGuard.binding,
  inject: [ReadCurrentMembership],
  useFactory: (memberships: ReadCurrentMembership) => currentMembershipCheck(memberships),
};
