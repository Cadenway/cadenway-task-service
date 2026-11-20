import type {
  ListOrganizationsWithTrashToPurge,
  ListOrganizationsWithTrashToPurgeOutput,
} from '../../../../tasks/public/trash/list-organizations-with-trash-to-purge.js';
import type { OrganizationsWithTrash } from '../../../application/ports/outbound/tasks/trash/organizations-with-trash.port.js';

/**
 * Class TasksOrganizationsWithTrash
 *
 * @description
 * `OrganizationsWithTrash` on the public operation `ListOrganizationsWithTrashToPurge` of the tasks
 * module, which reads in a read-only system transaction of its own, never joined to a tenant one.
 */
export class TasksOrganizationsWithTrash implements OrganizationsWithTrash {
  // #region Properties
  /**
   * Property listOrganizationsWithTrashToPurge
   *
   * @description
   * The read of the organizations with trash to erase.
   *
   * @type {ListOrganizationsWithTrashToPurge}
   * @readonly
   */
  private readonly listOrganizationsWithTrashToPurge: ListOrganizationsWithTrashToPurge;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the public operation of the tasks module.
   *
   * @param {ListOrganizationsWithTrashToPurge} listOrganizationsWithTrashToPurge - The read.
   * @constructor
   */
  public constructor(listOrganizationsWithTrashToPurge: ListOrganizationsWithTrashToPurge) {
    this.listOrganizationsWithTrashToPurge = listOrganizationsWithTrashToPurge;
  }
  // #endregion

  // #region Methods
  /**
   * Method page
   *
   * @description
   * Runs `ListOrganizationsWithTrashToPurge` for one page.
   *
   * @param {string | null} after - The last organization of the previous page, `null` for the
   * first.
   * @param {number} limit - Most organizations to return.
   * @returns {Promise<readonly string[]>} The organizations, in id order.
   */
  public async page(after: string | null, limit: number): Promise<readonly string[]> {
    const output: ListOrganizationsWithTrashToPurgeOutput =
      await this.listOrganizationsWithTrashToPurge.execute({ after, limit });
    return output.organizationIds;
  }
  // #endregion
}
