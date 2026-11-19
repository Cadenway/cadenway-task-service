import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { CheckListAccess } from '../../../../application/use-cases/queries/access/check-list-access/check-list-access.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant checkListAccessProvider
 *
 * @description
 * Builds the access check of a list for the realtime gateway on the tenant unit of work of the
 * module and the member directory, which reads the role of the person in the same transaction.
 *
 * @type {FactoryProvider<CheckListAccess>}
 */
export const checkListAccessProvider: FactoryProvider<CheckListAccess> = {
  provide: CheckListAccess,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): CheckListAccess =>
    new CheckListAccess(unitOfWork, members),
};
