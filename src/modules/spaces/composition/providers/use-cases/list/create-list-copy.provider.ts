import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { CreateListCopy } from '../../../../application/use-cases/commands/list/create-list-copy/create-list-copy.use-case.js';
import { CreateList } from '../../../../application/use-cases/commands/list/create-list/create-list.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/** Makes ordinary list creation available to the task forest copy. */
export const createListCopyProvider: FactoryProvider<CreateListCopy> = {
  provide: CreateListCopy,
  inject: [SPACES_UNIT_OF_WORK, MEMBER_DIRECTORY, CreateList],
  useFactory: (
    unitOfWork: SpacesUnitOfWork,
    members: MemberDirectory,
    create: CreateList,
  ): CreateListCopy => new CreateListCopy(unitOfWork, members, create),
};
