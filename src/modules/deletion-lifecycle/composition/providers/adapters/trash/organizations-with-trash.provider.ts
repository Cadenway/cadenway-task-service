import type { FactoryProvider } from '@nestjs/common';

import { ListOrganizationsWithTrashToPurge } from '../../../../../tasks/public/trash/list-organizations-with-trash-to-purge.js';
import type { OrganizationsWithTrash } from '../../../../application/ports/outbound/tasks/trash/organizations-with-trash.port.js';
import { TasksOrganizationsWithTrash } from '../../../../infrastructure/adapters/tasks/organizations-with-trash.adapter.js';
import { ORGANIZATIONS_WITH_TRASH } from '../../../tokens/trash/organizations-with-trash.token.js';

/**
 * Constant organizationsWithTrashProvider
 *
 * @description
 * Binds the `OrganizationsWithTrash` port to the public operation
 * `ListOrganizationsWithTrashToPurge` that `TasksModule` exports.
 *
 * @type {FactoryProvider<OrganizationsWithTrash>}
 */
export const organizationsWithTrashProvider: FactoryProvider<OrganizationsWithTrash> = {
  provide: ORGANIZATIONS_WITH_TRASH,
  inject: [ListOrganizationsWithTrashToPurge],
  useFactory: (
    listOrganizationsWithTrashToPurge: ListOrganizationsWithTrashToPurge,
  ): OrganizationsWithTrash => new TasksOrganizationsWithTrash(listOrganizationsWithTrashToPurge),
};
