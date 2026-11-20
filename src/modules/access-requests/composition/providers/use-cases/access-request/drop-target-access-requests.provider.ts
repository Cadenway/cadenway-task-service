import type { FactoryProvider } from '@nestjs/common';

import type { AccessRequestsUnitOfWork } from '../../../../application/ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';
import { DropTargetAccessRequests } from '../../../../application/use-cases/commands/access-request/drop-target-access-requests/drop-target-access-requests.use-case.js';
import { ACCESS_REQUESTS_UNIT_OF_WORK } from '../../../tokens/access-request/access-requests-unit-of-work.token.js';

/**
 * Constant dropTargetAccessRequestsProvider
 *
 * @description
 * Builds the dropping of the pending requests of a deleted target, which the jobs of
 * deletion-lifecycle run, on the tenant unit of work of the module, which joins the transaction of
 * the job batch.
 *
 * @type {FactoryProvider<DropTargetAccessRequests>}
 */
export const dropTargetAccessRequestsProvider: FactoryProvider<DropTargetAccessRequests> = {
  provide: DropTargetAccessRequests,
  inject: [ACCESS_REQUESTS_UNIT_OF_WORK],
  useFactory: (unitOfWork: AccessRequestsUnitOfWork): DropTargetAccessRequests =>
    new DropTargetAccessRequests(unitOfWork),
};
