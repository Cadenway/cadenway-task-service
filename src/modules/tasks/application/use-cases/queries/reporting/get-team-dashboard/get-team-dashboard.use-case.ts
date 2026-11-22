import { buildTeamDashboard } from '../../../../../domain/policies/reporting/dashboard.policy.js';
import {
  reportingWeekday,
  shiftReportingDate,
} from '../../../../../domain/value-objects/reporting/reporting-calendar.value-object.js';
import { CalendarDate } from '../../../../../domain/value-objects/task/calendar-date.value-object.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { ReportingBatches } from '../../../../services/reporting/reporting-batch.service.js';
import type { GetTeamDashboardInput } from './get-team-dashboard.input.js';
import type { GetTeamDashboardOutput } from './get-team-dashboard.output.js';

/** Computes the dashboard against one snapshot of the caller's current visibility. */
export class GetTeamDashboard {
  // #region Properties
  /** Report data and dependencies. */
  private readonly viewers: ViewerResolver;
  private readonly batches = new ReportingBatches();
  // #endregion

  // #region Constructor
  /** Binds the report dependencies. */
  public constructor(
    private readonly work: ReportingUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /** Executes the report operation. */
  public async execute(input: GetTeamDashboardInput): Promise<GetTeamDashboardOutput> {
    return this.work.runReadOnly(async (reader) => {
      const observedAt = this.now();
      const today = CalendarDate.parse(input.today);
      const firstDay = shiftReportingDate(today, -reportingWeekday(today) - (input.weeks - 1) * 7);
      // IANA offsets lie within a day of UTC; the policy applies the exact local boundary.
      const from = new Date(Date.parse(`${firstDay.format()}T00:00:00.000Z`) - 86_400_000);
      const localDayEndBound = Date.parse(`${today.format()}T00:00:00.000Z`) + 2 * 86_400_000;
      const through = new Date(Math.min(localDayEndBound, observedAt.getTime()));
      const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const listIds = await this.spaces.visibleListIds(input.organizationId, viewer, {
        liveOnly: true,
      });
      const tasks =
        listIds.length === 0
          ? []
          : await this.batches.read((after, limit) =>
              reader.dashboardTasks(input.organizationId, listIds, after, limit),
            );
      const transitions =
        listIds.length === 0
          ? []
          : await this.batches.read((after, limit) =>
              reader.dashboardTransitions(
                input.organizationId,
                listIds,
                from,
                through,
                after,
                limit,
              ),
            );
      const dashboard = buildTeamDashboard(
        { today: input.today, timeZone: input.timeZone, weeks: input.weeks, observedAt },
        tasks,
        transitions,
      );
      const ids = dashboard.overdueTasks.map((task) => task.id);
      if (ids.length === 0) return { ...dashboard, overdueTasks: [] };
      const summaries = await reader.dashboardSummaries(input.organizationId, listIds, ids);
      const byId = new Map(summaries.map((summary) => [summary.id, summary]));
      if (byId.size !== ids.length || summaries.length !== ids.length) {
        throw new Error('The dashboard overdue task summaries do not match the selected tasks.');
      }
      const overdueTasks = ids.map((id) => {
        const summary = byId.get(id);
        if (summary === undefined) {
          throw new Error('A dashboard overdue task summary is missing from the snapshot.');
        }
        return summary;
      });
      return { ...dashboard, overdueTasks };
    });
  }
  // #endregion
}
