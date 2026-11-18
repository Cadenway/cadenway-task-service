import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { HandOverPrivateSpaces } from '../../../../application/use-cases/commands/space/hand-over-private-spaces/hand-over-private-spaces.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant handOverPrivateSpacesProvider
 *
 * @description
 * Builds the handover of the private spaces of a removed member to the owner of the organization,
 * on the tenant unit of work, which joins the transaction the deduplicator of the kit opened for
 * the member event, and the member directory, which reads the owner in that transaction.
 *
 * @type {FactoryProvider<HandOverPrivateSpaces>}
 */
export const handOverPrivateSpacesProvider: FactoryProvider<HandOverPrivateSpaces> = {
  provide: HandOverPrivateSpaces,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): HandOverPrivateSpaces =>
    new HandOverPrivateSpaces(unitOfWork, members),
};
