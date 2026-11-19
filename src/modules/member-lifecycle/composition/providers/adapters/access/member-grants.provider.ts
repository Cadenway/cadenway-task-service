import type { FactoryProvider } from '@nestjs/common';

import { RemoveMemberGrants } from '../../../../../spaces/public/access/remove-member-grants.js';
import type { MemberGrants } from '../../../../application/ports/outbound/spaces/access/member-grants.port.js';
import { SpacesMemberGrants } from '../../../../infrastructure/adapters/spaces/member-grants.adapter.js';
import { MEMBER_GRANTS } from '../../../tokens/access/member-grants.token.js';

/**
 * Constant memberGrantsProvider
 *
 * @description
 * Binds the `MemberGrants` port to the public operation `RemoveMemberGrants` that `SpacesModule`
 * exports.
 *
 * @type {FactoryProvider<MemberGrants>}
 */
export const memberGrantsProvider: FactoryProvider<MemberGrants> = {
  provide: MEMBER_GRANTS,
  inject: [RemoveMemberGrants],
  useFactory: (removeMemberGrants: RemoveMemberGrants): MemberGrants =>
    new SpacesMemberGrants(removeMemberGrants),
};
