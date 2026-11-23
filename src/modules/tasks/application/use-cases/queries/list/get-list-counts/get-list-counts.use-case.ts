import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { ReadonlyTasksStore } from '../../../../models/transactions/readonly-tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { ListSummaryView } from '../../../../projections/count/list-summary.projection.js';
import type { TaskCountsView } from '../../../../projections/count/task-counts.projection.js';
import { ListSummaryBuilder } from '../../../../services/count/list-summary-builder.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { GetListCountsInput } from './get-list-counts.input.js';
import type { GetListCountsOutput } from './get-list-counts.output.js';

/**
 * Class GetListCounts
 *
 * @description
 * Reads a list the actor sees with the counts of its top-level tasks, subtasks left out
 * (`GET /internal/v1/lists/{listId}/counts`), in one read-only snapshot, without a lock. An
 * unknown list and a list the actor has no role on get the same answer, `list-not-found`. A list
 * without a task answers zeros.
 */
export class GetListCounts {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** The spaces module. */
  private readonly spaces: SpaceDirectory;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Pairs the list with its counts. */
  private readonly summaries: ListSummaryBuilder;
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
    this.summaries = new ListSummaryBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the list and its counts.
   *
   * @param {GetListCountsInput} input - The actor, the list and the date of the caller.
   * @returns {Promise<GetListCountsOutput>} The list and its counts.
   * @throws {TaskRefusal} `organization-not-found` or `list-not-found`.
   */
  public async execute(input: GetListCountsInput): Promise<GetListCountsOutput> {
    return this.unitOfWork.runReadOnly(
      async (store: ReadonlyTasksStore): Promise<GetListCountsOutput> => {
        const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        const placement: ListPlacement | null = await this.spaces.findVisibleList(
          input.organizationId,
          viewer,
          input.listId,
        );
        if (placement === null) {
          throw new TaskRefusal({ reason: 'list-not-found' });
        }
        const counts: ReadonlyMap<string, TaskCountsView> = await store.counter.countsOfLists(
          input.organizationId,
          [input.listId],
          input.today,
        );
        const [summary]: readonly ListSummaryView[] = this.summaries.build(
          [placement.list],
          counts,
        );
        if (summary === undefined) {
          throw new Error('The summary of the list is missing.');
        }
        return summary;
      },
      { snapshot: true },
    );
  }
  // #endregion
}
