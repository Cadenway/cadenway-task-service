import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListVisibleListIds } from '../../../../application/use-cases/queries/list/list-visible-list-ids/list-visible-list-ids.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listVisibleListIdsProvider
 *
 * @description
 * Builds the listing of the lists a member has a role on, which the tasks module calls, on the
 * tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<ListVisibleListIds>}
 */
export const listVisibleListIdsProvider: FactoryProvider<ListVisibleListIds> = {
  provide: ListVisibleListIds,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): ListVisibleListIds =>
    new ListVisibleListIds(unitOfWork),
};
