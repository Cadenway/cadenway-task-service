import type { ExecutionContext, FactoryProvider } from '@nestjs/common';

import { currentMembershipCheck } from '../../../../../../infrastructure/http/current-membership.js';
import { ReadCurrentMembership } from '../../../../../organization-members/public/membership/read-current-membership.js';
import { CurrentMembershipGuard } from '../../../../presentation/http/guards/goal/current-membership.guard.js';

/** Binds the guard to the Organization authority used for current membership. */
export const currentMembershipProvider: FactoryProvider<
  (context: ExecutionContext) => Promise<boolean>
> = {
  provide: CurrentMembershipGuard.binding,
  inject: [ReadCurrentMembership],
  useFactory: (memberships: ReadCurrentMembership) => currentMembershipCheck(memberships),
};
