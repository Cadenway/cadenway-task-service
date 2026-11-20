import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ResolveTaskTemplateSpace } from '../../../../application/use-cases/queries/space/resolve-task-template-space/resolve-task-template-space.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/** Binds library space authorization to space persistence and the membership projection. */
export const resolveTaskTemplateSpaceProvider: FactoryProvider<ResolveTaskTemplateSpace> = {
  provide: ResolveTaskTemplateSpace,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY],
  useFactory: (unitOfWork: SpacesUnitOfWork, members: MemberDirectory): ResolveTaskTemplateSpace =>
    new ResolveTaskTemplateSpace(unitOfWork, members),
};
