import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toListViews } from '../../../../mappers/list/list-view.mapper.js';
import type { ListWithGrants } from '../../../../models/access/list-with-grants.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListView } from '../../../../projections/list/list-view.projection.js';
import type { ListVisibleListIdsInput } from './list-visible-list-ids.input.js';
import type { ListVisibleListIdsOutput } from './list-visible-list-ids.output.js';

/**
 * Class ListVisibleListIds
 *
 * @description
 * Public operation of the spaces module for the tasks module: the ids of every list of the
 * organization a member has a role on ("Access" of `openapi/public/spaces.yaml`), in sidebar order
 * (spaces by creation, then lists by creation), so that "Mes tâches", "Accueil" and the other
 * collections of tasks leave out what the member does not see. One query, unpaged (the lists of an
 * organization are few), with the one visibility condition of the lists; the role of each row
 * comes from `listRoleOf`. The role of the member comes from the caller, which read it from the
 * copy of the memberships. It runs in `SpacesUnitOfWork.run`, which joins the tenant transaction
 * of the caller, scoped to the organization of the input; it takes no lock and appends no event.
 */
export class ListVisibleListIds {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the use case.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the ids of the lists the member has a role on.
   *
   * @param {ListVisibleListIdsInput} input - The member and its role.
   * @returns {Promise<ListVisibleListIdsOutput>} The ids of the lists.
   */
  public async execute(input: ListVisibleListIdsInput): Promise<ListVisibleListIdsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListVisibleListIdsOutput> => {
      const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
      const rows: ListWithGrants[] = await store.lists.listAllVisibleTo(
        input.organizationId,
        viewer,
      );
      return { listIds: toListViews(rows, viewer).map((view: ListView): string => view.list.id) };
    });
  }
  // #endregion
}
