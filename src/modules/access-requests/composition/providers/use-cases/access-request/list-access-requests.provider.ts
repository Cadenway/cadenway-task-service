import type { FactoryProvider } from '@nestjs/common';

import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { AccessTargets } from '../../../../application/ports/outbound/spaces/access/access-targets.port.js';
import type { TaskReferences } from '../../../../application/ports/outbound/tasks/task/task-references.port.js';
import type { AccessRequestsUnitOfWork } from '../../../../application/ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { ListAccessRequests } from '../../../../application/use-cases/queries/access-request/list-access-requests/list-access-requests.use-case.js';
import { ACCESS_TARGETS } from '../../../tokens/access/access-targets.token.js';
import { ACCESS_REQUESTS_UNIT_OF_WORK } from '../../../tokens/access-request/access-requests-unit-of-work.token.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { TASK_REFERENCES } from '../../../tokens/task/task-references.token.js';

/**
 * Constant listAccessRequestsProvider
 *
 * @description
 * Builds the listing of the pending requests on the read-only tenant unit of work of the module
 * and the ports to the organization-members, spaces and tasks modules, which join its transaction.
 *
 * @type {FactoryProvider<ListAccessRequests>}
 */
export const listAccessRequestsProvider: FactoryProvider<ListAccessRequests> = {
  provide: ListAccessRequests,
  inject: [ACCESS_REQUESTS_UNIT_OF_WORK, MEMBER_DIRECTORY, ACCESS_TARGETS, TASK_REFERENCES],
  useFactory: (
    unitOfWork: AccessRequestsUnitOfWork,
    members: MemberDirectory,
    targets: AccessTargets,
    tasks: TaskReferences,
  ): ListAccessRequests => new ListAccessRequests(unitOfWork, members, targets, tasks),
};
