import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, eq, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { TaskFilter } from '../../../../../application/models/query/task-filter.model.js';
import type { TaskOrder } from '../../../../../application/models/query/task-order.model.js';
import type { ReportingBatch } from '../../../../../application/models/reporting/reporting-batch.model.js';
import type { ReportingExportRow } from '../../../../../application/models/reporting/reporting-export-row.model.js';
import type { ReportingExportRows } from '../../../../../application/models/reporting/reporting-export-rows.model.js';
import type { ReportingReader } from '../../../../../application/ports/outbound/persistence/reporting/reporting-reader.port.js';
import type { TaskSummaryView } from '../../../../../application/projections/task/task-summary.projection.js';
import type { buildTeamDashboard } from '../../../../../domain/policies/reporting/dashboard.policy.js';
import type { buildTimesheet } from '../../../../../domain/policies/reporting/timesheet.policy.js';
import type { buildWorkload } from '../../../../../domain/policies/reporting/workload.policy.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import { taskFilterCondition } from '../../mappers/query/task-filter.mapper.js';
import { orderTerms } from '../../mappers/query/task-order.mapper.js';
import { taskPageColumns } from '../../mappers/query/task-page-row.mapper.js';
import { liveTask } from '../../mappers/task/live-task.mapper.js';
import { toPriorityKey, toStatusKey } from '../../mappers/task/task-values.mapper.js';
import { activityEntries } from '../../schemas/activity/activity-entry.schema.js';
import { taskCustomFieldValues } from '../../schemas/custom-field/task-custom-field-value.schema.js';
import { taskAssignees } from '../../schemas/task/task-assignee.schema.js';
import { taskLabels } from '../../schemas/task/task-label.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { taskTimeEntries } from '../../schemas/time/task-time-entry.schema.js';
import { DrizzleTaskPageLoader } from '../task/task-page-loader.repository.js';
import { DrizzleTaskCollections } from '../task/task-collections.repository.js';
import { DrizzleCustomFieldRepository } from '../custom-field/drizzle-custom-field.repository.js';

type WorkloadTask = Parameters<typeof buildWorkload>[1][number];
type TimesheetEntry = Parameters<typeof buildTimesheet>[1][number];
type DashboardTask = Parameters<typeof buildTeamDashboard>[1][number];
type DashboardTransition = Parameters<typeof buildTeamDashboard>[2][number];

const EXPORT_PAGE_SIZE = 250;

/** Bounds every keyset page, even when called by another internal consumer. */
function pageLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('Report pages must contain between 1 and 500 rows.');
  }
  return limit;
}

function batch<T extends { readonly id: string }, TResult>(
  rows: readonly T[],
  limit: number,
  map: (row: T) => TResult,
): ReportingBatch<TResult> {
  const selected = rows.slice(0, limit);
  return {
    items: selected.map(map),
    next: rows.length > limit ? (selected.at(-1)?.id ?? null) : null,
  };
}

function after(column: SQL, id: string | null): SQL {
  return id === null ? sql`` : sql` and ${column} > ${id}::uuid`;
}

/** Tenant-scoped reporting reads. All methods join the unit of work's stable snapshot. */
export class DrizzleReportingReader implements ReportingReader {
  // #region Properties
  /** Loads summaries and their collections for one bounded page. */
  private readonly pages: DrizzleTaskPageLoader;
  // #endregion

  // #region Constructor
  /** Binds reads to the caller's tenant transaction. */
  public constructor(private readonly db: TransactionDatabase) {
    this.pages = new DrizzleTaskPageLoader(db);
  }
  // #endregion

  // #region Methods
  /** Reads one page of tasks matching the list filters. */
  public async workloadTasks(
    organizationId: string,
    listId: string,
    filter: TaskFilter,
    weekStart: string,
    afterId: string | null,
    limit: number,
  ): Promise<ReportingBatch<WorkloadTask>> {
    pageLimit(limit);
    // Weekend-only spans can allocate to the preceding Friday; retain reversed historical spans.
    const result = await this.db.execute<{
      id: string;
      keyPrefix: string;
      keyNumber: number;
      name: string;
      status: string;
      startDate: string | null;
      dueDate: string | null;
      estimateMinutes: number | null;
    }>(sql`
      select ${tasks.id} as "id", ${tasks.keyPrefix} as "keyPrefix",
        ${tasks.keyNumber} as "keyNumber", ${tasks.name} as "name", ${tasks.status} as "status",
        ${tasks.startDate}::text as "startDate", ${tasks.dueDate}::text as "dueDate",
        ${tasks.estimateMinutes} as "estimateMinutes"
      from ${tasks}
      where ${taskFilterCondition(organizationId, listId, filter)}
        and ${tasks.status} <> 'cancelled' and ${tasks.estimateMinutes} > 0
        and ${tasks.dueDate} is not null
        and ((${tasks.dueDate} >= ${weekStart}::date
          and coalesce(${tasks.startDate}, ${tasks.dueDate}) <= ${weekStart}::date + 15)
          or ${tasks.startDate} > ${tasks.dueDate})${after(sql`${tasks.id}`, afterId)}
      order by ${tasks.id} limit ${limit + 1}`);
    const selected = result.rows.slice(0, limit);
    const assignees = await new DrizzleTaskCollections(this.db).assigneesOf(
      organizationId,
      selected.map(({ id }) => id),
    );
    return {
      items: selected.map((task) => ({
        key: TaskKey.of(task.keyPrefix, task.keyNumber),
        name: task.name,
        status: toStatusKey(task.status, `task ${task.id}`),
        startDate: task.startDate,
        dueDate: task.dueDate,
        estimateMinutes: task.estimateMinutes,
        assigneeIds: assignees.get(task.id) ?? [],
      })),
      next: result.rows.length > limit ? (selected.at(-1)?.id ?? null) : null,
    };
  }

  /** Reads one page of entries in the requested work-date week. */
  public async timesheetEntries(
    organizationId: string,
    listId: string,
    weekStart: string,
    afterId: string | null,
    limit: number,
  ): Promise<ReportingBatch<TimesheetEntry>> {
    pageLimit(limit);
    const rows = await this.db.execute<{
      id: string;
      keyPrefix: string;
      keyNumber: number;
      name: string;
      status: string;
      authorUserId: string;
      workDate: string;
      minutes: number;
    }>(sql`
      select ${taskTimeEntries.id} as "id", ${tasks.keyPrefix} as "keyPrefix",
        ${tasks.keyNumber} as "keyNumber", ${tasks.name} as "name", ${tasks.status} as "status",
        ${taskTimeEntries.authorUserId} as "authorUserId", ${taskTimeEntries.workDate}::text as "workDate",
        ${taskTimeEntries.minutes} as "minutes"
      from ${taskTimeEntries} join ${tasks} on ${tasks.organizationId} = ${taskTimeEntries.organizationId}
        and ${tasks.id} = ${taskTimeEntries.taskId}
      where ${taskTimeEntries.organizationId} = ${organizationId}::uuid
        and ${tasks.organizationId} = ${organizationId}::uuid and ${tasks.listId} = ${listId}::uuid
        and ${liveTask()} and ${taskTimeEntries.workDate} >= ${weekStart}::date
        and ${taskTimeEntries.workDate} < (${weekStart}::date + 7)${after(sql`${taskTimeEntries.id}`, afterId)}
      order by ${taskTimeEntries.id} limit ${limit + 1}`);
    return batch(rows.rows, limit, (row) => ({
      authorUserId: row.authorUserId,
      workDate: row.workDate,
      minutes: row.minutes,
      task: {
        key: TaskKey.of(row.keyPrefix, row.keyNumber),
        name: row.name,
        status: toStatusKey(row.status, `task ${row.id}`),
      },
    }));
  }

  /** Reads one page of currently visible live tasks. */
  public async dashboardTasks(
    organizationId: string,
    visibleListIds: readonly string[],
    afterId: string | null,
    limit: number,
  ): Promise<ReportingBatch<DashboardTask>> {
    pageLimit(limit);
    if (visibleListIds.length === 0) return { items: [], next: null };
    const result = await this.db.execute<{
      id: string;
      keyPrefix: string;
      keyNumber: number;
      status: string;
      dueDate: string | null;
    }>(sql`
      select ${tasks.id} as "id", ${tasks.keyPrefix} as "keyPrefix",
        ${tasks.keyNumber} as "keyNumber", ${tasks.status} as "status",
        ${tasks.dueDate}::text as "dueDate" from ${tasks}
      where ${tasks.organizationId} = ${organizationId}::uuid
        and ${anyOf(tasks.listId, visibleListIds, 'uuid')} and ${liveTask()}${after(sql`${tasks.id}`, afterId)}
      order by ${tasks.id} limit ${limit + 1}`);
    const selected = result.rows.slice(0, limit);
    const assignees = await new DrizzleTaskCollections(this.db).assigneesOf(
      organizationId,
      selected.map(({ id }) => id),
    );
    return {
      items: selected.map((task) => ({
        id: task.id,
        key: TaskKey.of(task.keyPrefix, task.keyNumber),
        status: toStatusKey(task.status, `task ${task.id}`),
        dueDate: task.dueDate,
        assigneeIds: assignees.get(task.id) ?? [],
      })),
      next: result.rows.length > limit ? (selected.at(-1)?.id ?? null) : null,
    };
  }

  /** Loads the dashboard's bounded overdue summaries within the same visibility snapshot. */
  public async dashboardSummaries(
    organizationId: string,
    visibleListIds: readonly string[],
    taskIds: readonly string[],
  ): Promise<readonly TaskSummaryView[]> {
    if (taskIds.length > 10) throw new Error('Dashboard summaries are limited to ten tasks.');
    if (taskIds.length === 0 || visibleListIds.length === 0) return [];
    const rows = await this.pages.load(
      organizationId,
      sql`
      select ${taskPageColumns()}, null as "sortValue" from ${tasks}
      where ${tasks.organizationId} = ${organizationId}::uuid
        and ${anyOf(tasks.listId, visibleListIds, 'uuid')}
        and ${anyOf(tasks.id, taskIds, 'uuid')} and ${liveTask()}
      order by ${tasks.id}`,
    );
    return rows.map(({ task }) => task);
  }

  /** Reads completion transitions for currently visible live tasks. */
  public async dashboardTransitions(
    organizationId: string,
    visibleListIds: readonly string[],
    from: Date,
    observedAt: Date,
    afterId: string | null,
    limit: number,
  ): Promise<ReportingBatch<DashboardTransition>> {
    pageLimit(limit);
    if (visibleListIds.length === 0) return { items: [], next: null };
    const rows = await this.db.execute<{ id: string; taskId: string; occurredAt: string }>(sql`
      select ${activityEntries.id} as "id", ${activityEntries.taskId} as "taskId",
        ${activityEntries.occurredAt} as "occurredAt"
      from ${activityEntries} join ${tasks} on ${tasks.organizationId} = ${activityEntries.organizationId}
        and ${tasks.id} = ${activityEntries.taskId}
      where ${activityEntries.organizationId} = ${organizationId}::uuid
        and ${tasks.organizationId} = ${organizationId}::uuid
        and ${anyOf(tasks.listId, visibleListIds, 'uuid')} and ${liveTask()}
        and ${activityEntries.kind} = 'status' and ${activityEntries.statusTo} = 'done'
        and ${activityEntries.occurredAt} >= ${from}::timestamptz
        and ${activityEntries.occurredAt} <= ${observedAt}::timestamptz${after(sql`${activityEntries.id}`, afterId)}
      order by ${activityEntries.id} limit ${limit + 1}`);
    return batch(rows.rows, limit, (row) => ({
      taskId: row.taskId,
      to: 'done',
      occurredAt: new Date(row.occurredAt),
    }));
  }

  /** Selects a bounded set of IDs once, with active custom fields and the requested sort. */
  public async prepareExport(
    organizationId: string,
    listId: string,
    spaceId: string,
    filter: TaskFilter,
    order: TaskOrder,
    sheetSort: { readonly column: string; readonly direction: 'asc' | 'desc' } | null,
    limit: number,
  ): Promise<ReportingExportRows> {
    const definitions = await new DrizzleCustomFieldRepository(this.db).activeDefinitions(
      organizationId,
      spaceId,
    );
    const builtins = [
      'name',
      'status',
      'priority',
      'people',
      'due',
      'estimate',
      'spent',
      'labels',
      'list',
      'points',
      'client',
    ];
    const requestedField = definitions.find((field) => field.id === sheetSort?.column);
    if (
      sheetSort !== null &&
      !builtins.includes(sheetSort.column) &&
      requestedField === undefined
    ) {
      return { invalidSort: true };
    }
    const pointsField = definitions.find((field) => field.sprintPoints);
    const clientField = definitions.find(
      (field) => field.type === 'text' && field.name.toLowerCase() === 'client',
    );
    const field =
      requestedField ??
      (sheetSort?.column === 'points'
        ? pointsField
        : sheetSort?.column === 'client'
          ? clientField
          : undefined);
    const fieldValue =
      field === undefined
        ? sql`(${tasks.id} is null)`
        : sql`(select ${field.type === 'number' ? taskCustomFieldValues.numberValue : taskCustomFieldValues.textValue}
      from ${taskCustomFieldValues} where ${taskCustomFieldValues.organizationId} = ${organizationId}::uuid
      and ${taskCustomFieldValues.taskId} = ${tasks.id} and ${taskCustomFieldValues.fieldId} = ${field.id}::uuid)`;
    const keys: Readonly<Record<string, SQL>> = {
      name: sql`${tasks.name} collate "C"`,
      status: sql`array_position(array['triage','backlog','todo','progress','review','testing','waiting','blocked','done','cancelled']::text[], ${tasks.status})`,
      priority: sql`array_position(array['urgente','haute','moyenne','basse']::text[], ${tasks.priority})`,
      people: sql`(select ${taskAssignees.userId}::text from ${taskAssignees} where ${taskAssignees.organizationId} = ${organizationId}::uuid and ${taskAssignees.taskId} = ${tasks.id} order by ${taskAssignees.position}, ${taskAssignees.userId} limit 1)`,
      due: sql`${tasks.dueDate}`,
      estimate: sql`coalesce(${tasks.estimateMinutes}, 0)`,
      spent: sql`(select coalesce(sum(${taskTimeEntries.minutes}), 0) from ${taskTimeEntries} where ${taskTimeEntries.organizationId} = ${organizationId}::uuid and ${taskTimeEntries.taskId} = ${tasks.id})`,
      labels: sql`(select ${taskLabels.name} from ${taskLabels} where ${taskLabels.organizationId} = ${organizationId}::uuid and ${taskLabels.taskId} = ${tasks.id} order by ${taskLabels.position}, ${taskLabels.labelKey} limit 1)`,
      list: sql`${tasks.listId}`,
      points: fieldValue,
      client: fieldValue,
    };
    const primaryOrder =
      sheetSort === null
        ? sql``
        : sql`${keys[sheetSort.column] ?? fieldValue} ${sql.raw(sheetSort.direction === 'desc' ? 'desc' : 'asc')} nulls last, `;
    // Match at most one row above the cap; sorting never needs to examine the rest of the list.
    const selected = await this.db.execute<{ id: string }>(sql`
      with eligible("taskId") as materialized (
        select ${tasks.id} from ${tasks}
        where ${taskFilterCondition(organizationId, listId, filter)}
          and ${tasks.spaceId} = ${spaceId}::uuid
        limit ${limit}
      )
      select ${tasks.id} as "id"
      from ${tasks} join eligible on ${tasks.id} = eligible."taskId"
      where ${tasks.organizationId} = ${organizationId}::uuid
      order by ${primaryOrder}${orderTerms(order)}`);
    const ids = selected.rows.map(({ id }) => id);
    return {
      fields: definitions.map(({ id, name }) => ({ id, name })),
      rowCount: ids.length,
      invalidSort: false,
      readPage: (offset) =>
        this.exportPage(
          organizationId,
          listId,
          spaceId,
          ids.slice(offset, offset + EXPORT_PAGE_SIZE),
        ),
    };
  }

  /** Reads the next page in the prepared order without retaining the previous page. */
  private async exportPage(
    organizationId: string,
    listId: string,
    spaceId: string,
    ids: readonly string[],
  ): Promise<readonly ReportingExportRow[]> {
    if (ids.length === 0) return [];
    const page = await this.db
      .select({
        id: tasks.id,
        keyPrefix: tasks.keyPrefix,
        keyNumber: tasks.keyNumber,
        name: tasks.name,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, organizationId),
          eq(tasks.listId, listId),
          eq(tasks.spaceId, spaceId),
          anyOf(tasks.id, ids, 'uuid'),
        ),
      )
      .orderBy(sql`array_position(${sql.param(ids)}::uuid[], ${tasks.id})`);

    // These IDs belong to the authorized list and space in this same repeatable-read snapshot.
    const taskIds = page.map(({ id }) => id);
    const collections = new DrizzleTaskCollections(this.db);
    const assignees = await collections.assigneesOf(organizationId, taskIds);
    const labels = await collections.labelsOf(organizationId, taskIds);
    const values = await new DrizzleCustomFieldRepository(this.db).valuesForTasks(
      organizationId,
      spaceId,
      taskIds,
    );
    const valuesByTask = new Map<string, Record<string, string | number>>();
    for (const { taskId, fieldId, value } of values) {
      const fields = valuesByTask.get(taskId) ?? {};
      fields[fieldId] = value;
      valuesByTask.set(taskId, fields);
    }

    return page.map((task) => ({
      taskKey: TaskKey.of(task.keyPrefix, task.keyNumber).format(),
      name: task.name,
      status: toStatusKey(task.status, `task ${task.id}`),
      priority: toPriorityKey(task.priority, `task ${task.id}`),
      assignees: assignees.get(task.id) ?? [],
      dueDate: task.dueDate,
      labels: labels.get(task.id) ?? [],
      customValues: valuesByTask.get(task.id) ?? {},
    }));
  }
  // #endregion
}
