import type { TaskFilter } from '../../../../models/query/task-filter.model.js';
import type { TaskOrder } from '../../../../models/query/task-order.model.js';
import type { TaskSummaryView } from '../../../../projections/task/task-summary.projection.js';
import type { buildTeamDashboard } from '../../../../../domain/policies/reporting/dashboard.policy.js';
import type { buildTimesheet } from '../../../../../domain/policies/reporting/timesheet.policy.js';
import type { buildWorkload } from '../../../../../domain/policies/reporting/workload.policy.js';
import type { ReportingExportRows } from '../../../../models/reporting/reporting-export-rows.model.js';
import type { ReportingBatch } from '../../../../models/reporting/reporting-batch.model.js';

/** All operations join the caller's tenant snapshot and restrict rows to the supplied scope. */
export interface ReportingReader {
  // #region Methods
  /** Reads matching live list tasks in stable task-key order, with their current assignees. */
  workloadTasks(
    organizationId: string,
    listId: string,
    filter: TaskFilter,
    afterId: string | null,
    limit: number,
  ): Promise<ReportingBatch<Parameters<typeof buildWorkload>[1][number]>>;

  /** Reads entries for currently live tasks of the list within the requested work-date week. */
  timesheetEntries(
    organizationId: string,
    listId: string,
    weekStart: string,
    afterId: string | null,
    limit: number,
  ): Promise<ReportingBatch<Parameters<typeof buildTimesheet>[1][number]>>;

  /** Reads live tasks in readable live lists and their completion facts through the observation instant. */
  dashboardTasks(
    organizationId: string,
    visibleListIds: readonly string[],
    afterId: string | null,
    limit: number,
  ): Promise<
    ReportingBatch<
      Parameters<typeof buildTeamDashboard>[1][number] & { readonly summary: TaskSummaryView }
    >
  >;

  /** Reads completion facts only for currently visible live tasks in live lists. */
  dashboardTransitions(
    organizationId: string,
    visibleListIds: readonly string[],
    from: Date,
    observedAt: Date,
    afterId: string | null,
    limit: number,
  ): Promise<ReportingBatch<Parameters<typeof buildTeamDashboard>[2][number]>>;

  /** Selects at most 10,001 ordered task IDs and loads the active fields in the current snapshot. */
  prepareExport(
    organizationId: string,
    listId: string,
    spaceId: string,
    filter: TaskFilter,
    order: TaskOrder,
    sheetSort: { readonly column: string; readonly direction: 'asc' | 'desc' } | null,
    limit: number,
  ): Promise<ReportingExportRows>;
  // #endregion
}
