import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ResolveIntakePlacement } from '../../../../application/use-cases/queries/intake/resolve-intake-placement/resolve-intake-placement.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/** Supplies the intake list read through the active spaces transaction. */
export const resolveIntakePlacementProvider: FactoryProvider<ResolveIntakePlacement> = {
  provide: ResolveIntakePlacement,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (work: SpacesUnitOfWork): ResolveIntakePlacement => new ResolveIntakePlacement(work),
};
