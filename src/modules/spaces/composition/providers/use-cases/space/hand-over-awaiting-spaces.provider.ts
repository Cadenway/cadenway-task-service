import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { HandOverAwaitingSpaces } from '../../../../application/use-cases/commands/space/hand-over-awaiting-spaces/hand-over-awaiting-spaces.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant handOverAwaitingSpacesProvider
 *
 * @description
 * Builds the handover of the spaces awaiting an owner on the unit of work and the member directory
 * of the module; member-lifecycle runs it when the copy learns the owner of an organization.
 *
 * @type {FactoryProvider<HandOverAwaitingSpaces>}
 */
export const handOverAwaitingSpacesProvider: FactoryProvider<HandOverAwaitingSpaces> = {
  provide: HandOverAwaitingSpaces,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): HandOverAwaitingSpaces =>
    new HandOverAwaitingSpaces(unitOfWork, members),
};
