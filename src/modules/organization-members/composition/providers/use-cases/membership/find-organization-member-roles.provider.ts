import type { FactoryProvider } from '@nestjs/common';

import type { MembershipsUnitOfWork } from '../../../../application/ports/outbound/transactions/membership/memberships-unit-of-work.port.js';
import { FindOrganizationMemberRoles } from '../../../../application/use-cases/queries/membership/find-organization-member-roles/find-organization-member-roles.use-case.js';
import { TENANT_UNIT_OF_WORK } from '../../../tokens/membership/tenant-unit-of-work.token.js';

export const findOrganizationMemberRolesProvider: FactoryProvider<FindOrganizationMemberRoles> = {
  provide: FindOrganizationMemberRoles,
  inject: [TENANT_UNIT_OF_WORK],
  useFactory: (unitOfWork: MembershipsUnitOfWork): FindOrganizationMemberRoles =>
    new FindOrganizationMemberRoles(unitOfWork),
};
