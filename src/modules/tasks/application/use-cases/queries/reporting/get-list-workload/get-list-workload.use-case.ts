import { buildWorkload } from '../../../../../domain/policies/reporting/workload.policy.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskFilterBuilder } from '../../../../services/query/task-filter-builder.service.js';
import { ReportingPage } from '../../../../services/reporting/reporting-page.service.js';
import { ReportingBatches } from '../../../../services/reporting/reporting-batch.service.js';
import type { GetListWorkloadInput } from './get-list-workload.input.js';
import type { GetListWorkloadOutput } from './get-list-workload.output.js';

/** Computes the visible workload before slicing its stable allocation rows. */
export class GetListWorkload {
  // #region Properties
  /** Report data and dependencies. */
  private readonly viewers: ViewerResolver;
  private readonly filters = new TaskFilterBuilder();
  private readonly pages = new ReportingPage();
  private readonly batches = new ReportingBatches();
  // #endregion

  // #region Constructor
  /** Binds the report dependencies. */
  public constructor(
    private readonly work: ReportingUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /** Executes the report operation. */
  public async execute(input: GetListWorkloadInput): Promise<GetListWorkloadOutput> {
    return this.work.runReadOnly(async (reader) => {
      const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const placement = await this.spaces.findVisibleList(
        input.organizationId,
        viewer,
        input.listId,
      );
      if (placement === null) throw new TaskRefusal({ reason: 'list-not-found' });
      const filter = this.filters.build(input.filter, viewer.userId);
      const tasks = await this.batches.read((after, limit) =>
        reader.workloadTasks(input.organizationId, input.listId, filter, after, limit),
      );
      const workload = buildWorkload(input.weekStart, tasks);
      const page = this.pages.slice(
        workload.items.filter((item) => item.totalMinutes > 0),
        (item) => ({ userId: item.assigneeId, taskKey: item.taskKey }),
        input.after,
        input.limit,
      );
      return {
        listId: input.listId,
        weekStart: input.weekStart,
        days: workload.days,
        totalMinutes: workload.totalMinutes,
        ...page,
      };
    });
  }
  // #endregion
}
