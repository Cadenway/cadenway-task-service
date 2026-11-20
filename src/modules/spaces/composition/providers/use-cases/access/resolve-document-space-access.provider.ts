import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import { FindOrganizationMember } from '../../../../../organization-members/public/membership/find-organization-member.js';
import { ResolveDocumentSpaceAccess } from '../../../../application/use-cases/queries/access/resolve-document-space-access/resolve-document-space-access.use-case.js';
import { ResolveGoalSpaces } from '../../../../application/use-cases/queries/goal/resolve-goal-spaces/resolve-goal-spaces.use-case.js';

/** Binds the current member and direct space decisions to the same tenant snapshot. */
export const resolveDocumentSpaceAccessProvider: FactoryProvider<ResolveDocumentSpaceAccess> = {
  provide: ResolveDocumentSpaceAccess,
  inject: [TenantTransactionRunner, FindOrganizationMember, ResolveGoalSpaces],
  useFactory: (
    runner: TenantTransactionRunner,
    memberships: FindOrganizationMember,
    spaces: ResolveGoalSpaces,
  ): ResolveDocumentSpaceAccess =>
    new ResolveDocumentSpaceAccess({
      read: (work) =>
        runner.run(
          () =>
            work({
              findViewer: (input) => memberships.execute({ ...input, lock: false }),
              resolveSpaces: (input) => spaces.execute({ ...input, lock: false }),
            }),
          { readOnly: true, isolationLevel: 'repeatable read' },
        ),
    }),
};
