import type { FactoryProvider } from '@nestjs/common';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ResolveCustomFieldSpace } from '../../../../application/use-cases/queries/space/resolve-custom-field-space/resolve-custom-field-space.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/** Binds the field space access operation to its owning module's transaction. */
export const resolveCustomFieldSpaceProvider: FactoryProvider<ResolveCustomFieldSpace> = {
  provide: ResolveCustomFieldSpace,
  inject: [SPACES_UNIT_OF_WORK],
  useFactory: (work: SpacesUnitOfWork): ResolveCustomFieldSpace =>
    new ResolveCustomFieldSpace(work),
};
