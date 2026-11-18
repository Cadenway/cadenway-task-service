import type { FactoryProvider } from '@nestjs/common';

import type { MembershipsUnitOfWork } from '../../../../application/ports/outbound/transactions/membership/memberships-unit-of-work.port.js';
import { FindOrganizationOwner } from '../../../../application/use-cases/queries/membership/find-organization-owner/find-organization-owner.use-case.js';
import { TENANT_UNIT_OF_WORK } from '../../../tokens/membership/tenant-unit-of-work.token.js';

/**
 * Constant findOrganizationOwnerProvider
 *
 * @description
 * Builds the reading of the owner of an organization on the tenant unit of work, which joins the
 * tenant transaction of its caller.
 *
 * @type {FactoryProvider<FindOrganizationOwner>}
 */
export const findOrganizationOwnerProvider: FactoryProvider<FindOrganizationOwner> = {
  provide: FindOrganizationOwner,
  inject: [TENANT_UNIT_OF_WORK],
  useFactory: (unitOfWork: MembershipsUnitOfWork): FindOrganizationOwner =>
    new FindOrganizationOwner(unitOfWork),
};
