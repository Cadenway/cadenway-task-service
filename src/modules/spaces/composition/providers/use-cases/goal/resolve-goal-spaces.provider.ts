import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ResolveGoalSpaces } from '../../../../application/use-cases/queries/goal/resolve-goal-spaces/resolve-goal-spaces.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/** Binds goal scope resolution to the owning Spaces transaction. */
export const resolveGoalSpacesProvider: FactoryProvider<ResolveGoalSpaces> = {
  provide: ResolveGoalSpaces,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (work: SpacesUnitOfWork): ResolveGoalSpaces => new ResolveGoalSpaces(work),
};
