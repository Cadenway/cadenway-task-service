import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { RemoveMemberGrants } from '../../../../application/use-cases/commands/access/remove-member-grants/remove-member-grants.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant removeMemberGrantsProvider
 *
 * @description
 * Builds one batch of the removal of the grants of a former member, which the clean-up job of
 * member-lifecycle calls, on the tenant unit of work of the module.
 *
 * @type {FactoryProvider<RemoveMemberGrants>}
 */
export const removeMemberGrantsProvider: FactoryProvider<RemoveMemberGrants> = {
  provide: RemoveMemberGrants,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): RemoveMemberGrants =>
    new RemoveMemberGrants(unitOfWork),
};
