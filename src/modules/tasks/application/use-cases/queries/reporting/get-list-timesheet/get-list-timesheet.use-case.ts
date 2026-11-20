import { buildTimesheet } from '../../../../../domain/policies/reporting/timesheet.policy.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { ReportingPage } from '../../../../services/reporting/reporting-page.service.js';
import { ReportingBatches } from '../../../../services/reporting/reporting-batch.service.js';
import type { GetListTimesheetInput } from './get-list-timesheet.input.js';
import type { GetListTimesheetOutput } from './get-list-timesheet.output.js';

/** Computes the full visible week and returns one stable page of authors and tasks. */
export class GetListTimesheet {
  // #region Properties
  /** Report data and dependencies. */
  private readonly viewers: ViewerResolver;
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
  public async execute(input: GetListTimesheetInput): Promise<GetListTimesheetOutput> {
    return this.work.runReadOnly(async (reader) => {
      const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const placement = await this.spaces.findVisibleList(
        input.organizationId,
        viewer,
        input.listId,
      );
      if (placement === null) throw new TaskRefusal({ reason: 'list-not-found' });
      const entries = await this.batches.read((after, limit) =>
        reader.timesheetEntries(input.organizationId, input.listId, input.weekStart, after, limit),
      );
      const timesheet = buildTimesheet(input.weekStart, entries);
      const page = this.pages.slice(
        timesheet.items,
        (item) => ({ userId: item.authorUserId, taskKey: item.taskKey }),
        input.after,
        input.limit,
      );
      return {
        listId: input.listId,
        weekStart: input.weekStart,
        days: timesheet.days,
        totalMinutes: timesheet.totalMinutes,
        ...page,
      };
    });
  }
  // #endregion
}
