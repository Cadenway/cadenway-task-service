import type { FactoryProvider } from '@nestjs/common';

import type { MembershipsUnitOfWork } from '../../../../application/ports/outbound/transactions/membership/memberships-unit-of-work.port.js';
import { ListActiveMembers } from '../../../../application/use-cases/queries/membership/list-active-members/list-active-members.use-case.js';
import { TENANT_UNIT_OF_WORK } from '../../../tokens/membership/tenant-unit-of-work.token.js';

/** Provides the membership page on the caller's tenant transaction. */
export const listActiveMembersProvider: FactoryProvider<ListActiveMembers> = {
  provide: ListActiveMembers,
  inject: [TENANT_UNIT_OF_WORK],
  useFactory: (unit: MembershipsUnitOfWork): ListActiveMembers => new ListActiveMembers(unit),
};
