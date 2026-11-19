import type { FactoryProvider } from '@nestjs/common';

import type { TrashSystemUnitOfWork } from '../../../../application/ports/outbound/transactions/trash/trash-system-unit-of-work.port.js';
import { ListOrganizationsWithTrashToPurge } from '../../../../application/use-cases/queries/trash/list-organizations-with-trash-to-purge/list-organizations-with-trash-to-purge.use-case.js';
import { TRASH_SYSTEM_UNIT_OF_WORK } from '../../../tokens/trash/trash-system-unit-of-work.token.js';

/**
 * Constant listOrganizationsWithTrashToPurgeProvider
 *
 * @description
 * Builds the read of the organizations with trash to erase, which the daily schedule of the purge
 * of deletion-lifecycle pages, on the read-only system unit of work of the module.
 *
 * @type {FactoryProvider<ListOrganizationsWithTrashToPurge>}
 */
export const listOrganizationsWithTrashToPurgeProvider: FactoryProvider<ListOrganizationsWithTrashToPurge> =
  {
    provide: ListOrganizationsWithTrashToPurge,
    inject: [TRASH_SYSTEM_UNIT_OF_WORK],
    useFactory: (unitOfWork: TrashSystemUnitOfWork): ListOrganizationsWithTrashToPurge =>
      new ListOrganizationsWithTrashToPurge(unitOfWork),
  };
