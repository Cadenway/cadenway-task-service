import type { FactoryProvider } from '@nestjs/common';

import { ListActiveMembers } from '../../../../../organization-members/public/membership/list-active-members.js';
import { FindListReaderAudience } from '../../../../../spaces/public/list/find-list-reader-audience.js';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ListTaskParticipants } from '../../../../application/use-cases/queries/task/list-task-participants/list-task-participants.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

/** Binds the participant directory to the audience and membership owners. */
export const listTaskParticipantsProvider: FactoryProvider<ListTaskParticipants> = {
  provide: ListTaskParticipants,
  inject: [
    TASKS_UNIT_OF_WORK,
    MEMBER_DIRECTORY,
    SPACE_DIRECTORY,
    FindListReaderAudience,
    ListActiveMembers,
  ],
  useFactory: (
    unit: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
    findAudience: FindListReaderAudience,
    listActive: ListActiveMembers,
  ): ListTaskParticipants =>
    new ListTaskParticipants(unit, members, spaces, {
      /** Resolves list visibility before paging the current membership projection. */
      list: async (organizationId, listId, after, limit) => {
        const audience = await findAudience.execute({ organizationId, listId });
        return audience === null
          ? []
          : listActive.execute({ organizationId, after, limit, ...audience });
      },
    }),
};
