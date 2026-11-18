import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { TaskListState } from '../../../../../domain/value-objects/list/task-list-state.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { VisibleList } from '../../../../projections/list/visible-list.projection.js';
import type { VisibleSpace } from '../../../../projections/space/visible-space.projection.js';
import type { SpaceView } from '../../../../projections/space/space-view.projection.js';
import { SpaceViewBuilder } from '../../../../services/space/space-view-builder.service.js';
import type { FindVisibleListInput } from './find-visible-list.input.js';
import type { FindVisibleListOutput } from './find-visible-list.output.js';

/**
 * Class FindVisibleList
 *
 * @description
 * Public operation of the spaces module for the tasks module: finds the list a task is created or
 * moved to, with its space, when the member sees it. A list that does not exist, a list of another
 * organization and a list of a space the member does not see (a guest sees none, a private space is
 * seen by its owner only, a space awaiting an owner by nobody: `Space.isVisibleTo`) all answer
 * `null`; the caller turns it into its own refusal, so no case tells another apart. The role of the
 * member comes from the caller, which read it from the copy of the memberships. It runs in
 * `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller, scoped to the
 * organization of the input; it takes no lock and appends no event.
 */
export class FindVisibleList {
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

  /**
   * Property views
   *
   * @description
   * Adds the next key to the space.
   *
   * @type {SpaceViewBuilder}
   * @readonly
   */
  private readonly views: SpaceViewBuilder;
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
    this.views = new SpaceViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the list and its space, and checks that the member sees the space.
   *
   * @param {FindVisibleListInput} input - The member, its role and the list.
   * @returns {Promise<FindVisibleListOutput | null>} The list and its space, or `null` when the
   * member does not see the list.
   */
  public async execute(input: FindVisibleListInput): Promise<FindVisibleListOutput | null> {
    return this.unitOfWork.run(
      async (store: SpacesStore): Promise<FindVisibleListOutput | null> => {
        const list: TaskList | null = await store.lists.find(input.organizationId, input.listId);
        if (list === null) {
          return null;
        }
        const space: Space | null = await store.spaces.find(
          input.organizationId,
          list.snapshot.spaceId,
        );
        const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
        if (!space?.isVisibleTo(viewer)) {
          return null;
        }
        const view: SpaceView = await this.views.buildOne(
          store.prefixes,
          input.organizationId,
          space.snapshot,
        );
        return { list: this.toVisibleList(list.snapshot), space: this.toVisibleSpace(view) };
      },
    );
  }

  /**
   * Method toVisibleList
   *
   * @description
   * Copies a stored list into its public projection.
   *
   * @param {TaskListState} state - The stored list.
   * @returns {VisibleList} The projection.
   */
  private toVisibleList(state: TaskListState): VisibleList {
    return {
      id: state.id,
      spaceId: state.spaceId,
      name: state.name,
      icon: state.icon,
      color: state.color,
      sprint:
        state.sprint === null
          ? null
          : {
              startDate: state.sprint.startDate,
              endDate: state.sprint.endDate,
              goal: state.sprint.goal,
            },
      createdAt: state.createdAt,
      version: state.version,
    };
  }

  /**
   * Method toVisibleSpace
   *
   * @description
   * Copies a space and its next key into the public projection.
   *
   * @param {SpaceView} view - The stored space and the key its next task would take.
   * @returns {VisibleSpace} The projection.
   */
  private toVisibleSpace(view: SpaceView): VisibleSpace {
    const { space, nextKey }: SpaceView = view;
    return {
      id: space.id,
      name: space.name,
      prefix: space.prefix,
      description: space.description,
      icon: space.icon,
      color: space.color,
      visibility: space.visibility,
      ownerUserId: space.ownerUserId,
      statuses: space.statuses,
      nextKey,
      createdAt: space.createdAt,
      version: space.version,
    };
  }
  // #endregion
}
