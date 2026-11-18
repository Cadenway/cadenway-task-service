import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ListCurrentSprints } from '../../../../application/use-cases/queries/list/list-current-sprints/list-current-sprints.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant listCurrentSprintsProvider
 *
 * @description
 * Builds the listing of the sprints under way in the spaces the viewer sees, which the tasks module
 * calls, on the tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<ListCurrentSprints>}
 */
export const listCurrentSprintsProvider: FactoryProvider<ListCurrentSprints> = {
  provide: ListCurrentSprints,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): ListCurrentSprints =>
    new ListCurrentSprints(unitOfWork),
};
