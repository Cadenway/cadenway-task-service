import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toListViews } from '../../../../mappers/list/list-view.mapper.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { ListWithGrants } from '../../../../models/access/list-with-grants.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListView } from '../../../../projections/list/list-view.projection.js';
import type { FindVisibleListsInput } from './find-visible-lists.input.js';
import type { FindVisibleListsOutput } from './find-visible-lists.output.js';

/**
 * Constant MAX_LIST_IDS
 *
 * @description
 * Most lists one call reads: a page of the archives holds 100 items at most
 * (`limit` of `openapi/internal/task-service.yaml`).
 *
 * @type {number}
 */
const MAX_LIST_IDS: number = 100;

/**
 * Constant UUID
 *
 * @description
 * The shape of a list id, so that an id that is not a UUID never reaches SQL, which would refuse
 * it.
 *
 * @type {RegExp}
 */
const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Class FindVisibleLists
 *
 * @description
 * Public operation of the spaces module for the tasks module: those of some lists the member has
 * a role on, archived ones included (an archived list reads by its id, "Lists" of
 * `openapi/public/archives.yaml`), each with that role, in no particular order. A list that does
 * not exist, of another organization or that the member has no role on is left out, so no case
 * tells another apart; an id that is not a UUID names no list. More than 100 ids is a defect of
 * the caller and throws. The role of the member comes from the caller, which read it from the
 * copy of the memberships. It runs in `SpacesUnitOfWork.run`, which joins the tenant transaction
 * of the caller, scoped to the organization of the input; one statement, no lock, no event, and
 * none at all when no id is left.
 */
export class FindVisibleLists {
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
   * Reads the lists the member has a role on among those asked for.
   *
   * @param {FindVisibleListsInput} input - The member, its role and the ids.
   * @returns {Promise<FindVisibleListsOutput>} The lists the member has a role on.
   * @throws {Error} When more than 100 ids are asked for.
   */
  public async execute(input: FindVisibleListsInput): Promise<FindVisibleListsOutput> {
    if (input.listIds.length > MAX_LIST_IDS) {
      throw new Error(`FindVisibleLists reads ${String(MAX_LIST_IDS)} lists at most.`);
    }
    const ids: string[] = [
      ...new Set(
        input.listIds
          .filter((id: string): boolean => UUID.test(id))
          .map((id: string): string => id.toLowerCase()),
      ),
    ];
    if (ids.length === 0) {
      return { lists: [] };
    }
    return this.unitOfWork.run(async (store: SpacesStore): Promise<FindVisibleListsOutput> => {
      const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
      const rows: ListWithGrants[] = await store.lists.listVisibleByIds(
        input.organizationId,
        viewer,
        ids,
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
