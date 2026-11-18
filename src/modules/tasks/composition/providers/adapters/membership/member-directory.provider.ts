import type { FactoryProvider } from '@nestjs/common';

import { FindOrganizationMember } from '../../../../../organization-members/public/membership/find-organization-member.js';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import { OrganizationMembersMemberDirectory } from '../../../../infrastructure/adapters/organization-members/organization-members-member-directory.adapter.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';

/**
 * Constant memberDirectoryProvider
 *
 * @description
 * Binds the `MemberDirectory` port to the reading `OrganizationMembersModule` exports, which joins
 * the tenant transaction of the calling use case.
 *
 * @type {FactoryProvider<MemberDirectory>}
 */
export const memberDirectoryProvider: FactoryProvider<MemberDirectory> = {
  provide: MEMBER_DIRECTORY,
  inject: [FindOrganizationMember],
  useFactory: (findMember: FindOrganizationMember): MemberDirectory =>
    new OrganizationMembersMemberDirectory(findMember),
};
