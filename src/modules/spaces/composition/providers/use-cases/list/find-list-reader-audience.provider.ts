import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { FindListReaderAudience } from '../../../../application/use-cases/queries/list/find-list-reader-audience/find-list-reader-audience.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/** Provides the reader audience lookup on the caller's tenant transaction. */
export const findListReaderAudienceProvider: FactoryProvider<FindListReaderAudience> = {
  provide: FindListReaderAudience,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (unit: SpacesUnitOfWork): FindListReaderAudience => new FindListReaderAudience(unit),
};
