import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListManagedAccessTargets } from '../../../../application/use-cases/queries/access/list-managed-access-targets/list-managed-access-targets.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listManagedAccessTargetsProvider
 *
 * @description
 * Builds the listing of what a member answers access requests for, which the access-requests
 * module calls, on the tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<ListManagedAccessTargets>}
 */
export const listManagedAccessTargetsProvider: FactoryProvider<ListManagedAccessTargets> = {
  provide: ListManagedAccessTargets,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): ListManagedAccessTargets =>
    new ListManagedAccessTargets(unitOfWork),
};
