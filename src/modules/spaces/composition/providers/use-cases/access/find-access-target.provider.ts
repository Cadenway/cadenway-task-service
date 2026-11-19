import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { FindAccessTarget } from '../../../../application/use-cases/queries/access/find-access-target/find-access-target.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant findAccessTargetProvider
 *
 * @description
 * Builds the lookup of the target of an access request, which the access-requests module calls,
 * on the tenant unit of work of the module: it joins the transaction of the caller.
 *
 * @type {FactoryProvider<FindAccessTarget>}
 */
export const findAccessTargetProvider: FactoryProvider<FindAccessTarget> = {
  provide: FindAccessTarget,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): FindAccessTarget => new FindAccessTarget(unitOfWork),
};
