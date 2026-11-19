import type { FactoryProvider } from '@nestjs/common';

import { FindAccessTarget } from '../../../../../spaces/public/access/find-access-target.js';
import { GrantRequestedAccess } from '../../../../../spaces/public/access/grant-requested-access.js';
import { ListManagedAccessTargets } from '../../../../../spaces/public/access/list-managed-access-targets.js';
import type { AccessTargets } from '../../../../application/ports/outbound/spaces/access/access-targets.port.js';
import { SpacesAccessTargets } from '../../../../infrastructure/adapters/spaces/spaces-access-targets.adapter.js';
import { ACCESS_TARGETS } from '../../../tokens/access/access-targets.token.js';

/**
 * Constant accessTargetsProvider
 *
 * @description
 * Binds the `AccessTargets` port to the public operations `FindAccessTarget`,
 * `ListManagedAccessTargets` and `GrantRequestedAccess` that `SpacesModule` exports, which join the
 * tenant transaction of the calling use case.
 *
 * @type {FactoryProvider<AccessTargets>}
 */
export const accessTargetsProvider: FactoryProvider<AccessTargets> = {
  provide: ACCESS_TARGETS,
  inject: [FindAccessTarget, ListManagedAccessTargets, GrantRequestedAccess],
  useFactory: (
    findAccessTarget: FindAccessTarget,
    listManagedAccessTargets: ListManagedAccessTargets,
    grantRequestedAccess: GrantRequestedAccess,
  ): AccessTargets =>
    new SpacesAccessTargets(findAccessTarget, listManagedAccessTargets, grantRequestedAccess),
};
