import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { HoldList } from '../../../../application/use-cases/commands/list/hold-list/hold-list.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant holdListProvider
 *
 * @description
 * Builds the hold of a list a task joins, which the tasks module calls, on the tenant unit of
 * work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<HoldList>}
 */
export const holdListProvider: FactoryProvider<HoldList> = {
  provide: HoldList,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): HoldList => new HoldList(unitOfWork),
};
