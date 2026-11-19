import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { LabelPosition } from '../../../../models/label/label-position.model.js';
import type { ListedLabel } from '../../../../models/label/listed-label.model.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import type { ListLabelsInput } from './list-labels.input.js';
import type { ListLabelsOutput } from './list-labels.output.js';

/**
 * Class ListLabels
 *
 * @description
 * Lists the labels of the tasks the actor sees, each label once whatever its case, one keyset page
 * at a time (`GET /internal/v1/labels`), without a lock. Only the tasks of the lists the actor has
 * a role on count, subtasks included, and only their spellings; the lists come from the spaces
 * module (a guest has a role on the lists shared with them only). An actor with a role on no list
 * gets an empty page without a read of the labels.
 */
export class ListLabels {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Cuts the page. */
  private readonly pages: PageSlicer;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the two directories.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.unitOfWork = unitOfWork;
    this.spaces = spaces;
    this.viewers = new ViewerResolver(members);
    this.pages = new PageSlicer();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the page.
   *
   * @param {ListLabelsInput} input - The actor, the search and the page.
   * @returns {Promise<ListLabelsOutput>} The labels and where the next page starts.
   * @throws {TaskRefusal} `organization-not-found`.
   */
  public async execute(input: ListLabelsInput): Promise<ListLabelsOutput> {
    return this.unitOfWork.runReadOnly(async (store: TasksStore): Promise<ListLabelsOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const listIds: readonly string[] = await this.spaces.visibleListIds(
        input.organizationId,
        viewer,
      );
      if (listIds.length === 0) {
        return { items: [], next: null };
      }
      const rows: readonly ListedLabel[] = await store.labels.pageOfLabels(
        input.organizationId,
        listIds,
        input.search,
        input.after,
        input.limit + 1,
      );
      const page: Slice<ListedLabel, LabelPosition> = this.pages.slice(
        rows,
        input.limit,
        (row: ListedLabel): LabelPosition => row.position,
      );
      return { items: page.items.map((row: ListedLabel) => row.label), next: page.next };
    });
  }
  // #endregion
}
