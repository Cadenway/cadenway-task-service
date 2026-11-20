import type { FactoryProvider } from '@nestjs/common';

import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { CreateList } from '../../../../application/use-cases/commands/list/create-list/create-list.use-case.js';
import { CreateSpace } from '../../../../application/use-cases/commands/space/create-space/create-space.use-case.js';
import { ProvisionOnboardingSpace } from '../../../../application/use-cases/commands/space/provision-onboarding-space/provision-onboarding-space.use-case.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/** Composes preset provisioning with ordinary space and list writes. */
export const provisionOnboardingSpaceProvider: FactoryProvider<ProvisionOnboardingSpace> = {
  provide: ProvisionOnboardingSpace,
  inject: [SPACES_UNIT_OF_WORK, CreateSpace, CreateList],
  useFactory: (
    work: SpacesUnitOfWork,
    space: CreateSpace,
    list: CreateList,
  ): ProvisionOnboardingSpace => new ProvisionOnboardingSpace(work, space, list),
};
