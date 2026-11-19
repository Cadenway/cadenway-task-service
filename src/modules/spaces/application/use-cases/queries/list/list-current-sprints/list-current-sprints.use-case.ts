import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toListViews } from '../../../../mappers/list/list-view.mapper.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { ListWithGrants } from '../../../../models/access/list-with-grants.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListView } from '../../../../projections/list/list-view.projection.js';
import type { ListCurrentSprintsInput } from './list-current-sprints.input.js';
import type { ListCurrentSprintsOutput } from './list-current-sprints.output.js';

/**
 * Class ListCurrentSprints
 *
 * @description
 * Public operation of the spaces module for the tasks module: the sprints under way that a member
 * has a role on, that is those whose start is on or before `today` and whose end is on or after
 * it, ordered by end date, then creation, at most `limit`, each with the role of the member. A
 * guest gets the sprints shared with them; any other member those of the spaces of the whole
 * organization whose switch "Accès de l’organisation" is on, those of the spaces they own, and
 * those shared with them through their space or themselves, never one of a space awaiting an
 * owner (the one visibility condition of the lists, then `listRoleOf`). The role comes from the
 * caller, which read it from the copy of the memberships. It runs in `SpacesUnitOfWork.run`, which
 * joins the tenant transaction of the caller, scoped to the organization of the input; it takes
 * no lock and appends no event.
 */
export class ListCurrentSprints {
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
   * Reads the sprints under way the member has a role on.
   *
   * @param {ListCurrentSprintsInput} input - The member, its role, the day and the bound.
   * @returns {Promise<ListCurrentSprintsOutput>} The sprints.
   */
  public async execute(input: ListCurrentSprintsInput): Promise<ListCurrentSprintsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListCurrentSprintsOutput> => {
      const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
      const rows: ListWithGrants[] = await store.lists.listCurrentSprintsVisibleTo(
        input.organizationId,
        viewer,
        input.today,
        input.limit,
      );
      return {
        lists: toListViews(rows, viewer).map((view: ListView) =>
          toVisibleList(view.list, view.callerRole),
        ),
      };
    });
  }
  // #endregion
}
