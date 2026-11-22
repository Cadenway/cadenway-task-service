import { CONFIG, InternalTokenSigner } from '@cadenway/nest-common';
import type { FactoryProvider } from '@nestjs/common';

import type { AppConfig } from '../../../../../../config/app-config.js';
import { ReadCurrentMembership } from '../../../../application/use-cases/queries/membership/read-current-membership/read-current-membership.use-case.js';
import { OrganizationMembershipAuthority } from '../../../../infrastructure/adapters/organization/organization-membership-authority.adapter.js';

/** Verifies current membership with the service's signed Organization request. */
export const readCurrentMembershipProvider: FactoryProvider<ReadCurrentMembership> = {
  provide: ReadCurrentMembership,
  inject: [CONFIG],
  useFactory: async (config: AppConfig) => {
    const origin = config.ORGANIZATION_SERVICE_URL;
    const privateJwk = config.TASK_SERVICE_INTERNAL_TOKEN_PRIVATE_JWK;
    const connection =
      origin === undefined || privateJwk === undefined
        ? null
        : {
            origin,
            signer: await InternalTokenSigner.create({ issuer: 'task-service', privateJwk }),
          };
    const authority = new OrganizationMembershipAuthority(connection);
    return new ReadCurrentMembership((organizationId, userId) =>
      authority.find(organizationId, userId),
    );
  },
};
