import type { FactoryProvider } from '@nestjs/common';

import { FindOrganizationMember } from '../../../../../organization-members/public/membership/find-organization-member.js';
import { FindOrganizationOwner } from '../../../../../organization-members/public/membership/find-organization-owner.js';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import { OrganizationMembersMemberDirectory } from '../../../../infrastructure/adapters/organization-members/organization-members-member-directory.adapter.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';

/**
 * Constant memberDirectoryProvider
 *
 * @description
 * Binds the `MemberDirectory` port to the readings `OrganizationMembersModule` exports, which join
 * the tenant transaction of the calling use case.
 *
 * @type {FactoryProvider<MemberDirectory>}
 */
export const memberDirectoryProvider: FactoryProvider<MemberDirectory> = {
  provide: MEMBER_DIRECTORY,
  inject: [FindOrganizationMember, FindOrganizationOwner],
  useFactory: (
    findMember: FindOrganizationMember,
    findOwner: FindOrganizationOwner,
  ): MemberDirectory => new OrganizationMembersMemberDirectory(findMember, findOwner),
};
