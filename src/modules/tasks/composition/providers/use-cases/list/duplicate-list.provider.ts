import type { FactoryProvider } from '@nestjs/common';

import { CreateListCopy } from '../../../../../spaces/public/list/create-list-copy.js';
import { FindOrganizationMemberRoles } from '../../../../../organization-members/public/membership/find-organization-member-roles.js';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { DuplicateList } from '../../../../application/use-cases/commands/list/duplicate-list/duplicate-list.use-case.js';
import { SpacesListCopyDestination } from '../../../../infrastructure/adapters/spaces/spaces-list-copy-destination.adapter.js';
import { OrganizationBatchAssigneeRoles } from '../../../../infrastructure/adapters/members/organization-batch-assignee-roles.adapter.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

export const duplicateListProvider: FactoryProvider<DuplicateList> = {
  provide: DuplicateList,
  inject: [
    TASKS_UNIT_OF_WORK,
    MEMBER_DIRECTORY,
    SPACE_DIRECTORY,
    CreateListCopy,
    FindOrganizationMemberRoles,
  ],
  useFactory: (
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
    create: CreateListCopy,
    roles: FindOrganizationMemberRoles,
  ): DuplicateList =>
    new DuplicateList(
      unitOfWork,
      members,
      spaces,
      new SpacesListCopyDestination(create),
      new OrganizationBatchAssigneeRoles(roles),
    ),
};
