import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListVisibleSpaceIds } from '../../../../application/use-cases/queries/space/list-visible-space-ids/list-visible-space-ids.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listVisibleSpaceIdsProvider
 *
 * @description
 * Builds the listing of the ids of the spaces a viewer sees, which the tasks module calls, on the
 * tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<ListVisibleSpaceIds>}
 */
export const listVisibleSpaceIdsProvider: FactoryProvider<ListVisibleSpaceIds> = {
  provide: ListVisibleSpaceIds,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): ListVisibleSpaceIds =>
    new ListVisibleSpaceIds(unitOfWork),
};
