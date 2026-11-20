import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { FindFavoriteSpaces } from '../../../../application/use-cases/queries/space/find-favorite-spaces/find-favorite-spaces.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/** Binds the favorites lookup to the Spaces tenant transaction. */
export const findFavoriteSpacesProvider: FactoryProvider<FindFavoriteSpaces> = {
  provide: FindFavoriteSpaces,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unitOfWork: SpacesUnitOfWork): FindFavoriteSpaces =>
    new FindFavoriteSpaces(unitOfWork),
};
