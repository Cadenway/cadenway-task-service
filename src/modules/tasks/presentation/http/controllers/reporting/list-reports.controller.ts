import {
  GetListTimesheetInternalResponse,
  GetListWorkloadInternalResponse,
  GetSprintReportInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';

import { ExportListTasks } from '../../../../application/use-cases/queries/reporting/export-list-tasks/export-list-tasks.use-case.js';
import { GetListTimesheet } from '../../../../application/use-cases/queries/reporting/get-list-timesheet/get-list-timesheet.use-case.js';
import { GetListWorkload } from '../../../../application/use-cases/queries/reporting/get-list-workload/get-list-workload.use-case.js';
import { GetSprintReport } from '../../../../application/use-cases/queries/reporting/get-sprint-report/get-sprint-report.use-case.js';
import { ExportQuery } from '../../dto/input/reporting/export-query.dto.js';
import { SprintReportQuery } from '../../dto/input/reporting/sprint-report-query.dto.js';
import { TimesheetQuery } from '../../dto/input/reporting/timesheet-query.dto.js';
import { WorkloadQuery } from '../../dto/input/reporting/workload-query.dto.js';
import { ListTasksPath } from '../../dto/input/task/list-tasks-path.dto.js';
import { answerReportingRefusals } from '../../errors/reporting/reporting.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import {
  taskFilterFingerprint,
  toTaskFilterInput,
  toTaskOrder,
} from '../../mappers/query/task-filter.mapper.js';
import {
  reportingCursor,
  reportingPosition,
} from '../../mappers/reporting/reporting-cursor.mapper.js';
import {
  sprintReportCursor,
  sprintReportPosition,
} from '../../mappers/reporting/sprint-report-cursor.mapper.js';
import { writeTaskExport } from '../../mappers/reporting/task-export-response.mapper.js';

/** Reports and export projections for a list visible to the verified caller. */
@Controller('internal/v1/lists')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ListReportsController {
  // #region Constructor
  /** Binds the reporting queries. */
  public constructor(
    private readonly workloadQuery: GetListWorkload,
    private readonly timesheetQuery: GetListTimesheet,
    private readonly sprintQuery: GetSprintReport,
    private readonly exportQuery: ExportListTasks,
  ) {}
  // #endregion

  // #region Methods
  /** Reads a two-week allocation with whole-window totals. */
  @Get(':listId/workload')
  public async workload(
    @Param() path: ListTasksPath,
    @Query() query: WorkloadQuery,
  ): Promise<z.output<typeof GetListWorkloadInternalResponse>> {
    const caller = toCaller();
    const listId = path.listId.toLowerCase();
    const filter = toTaskFilterInput(query);
    const scope = {
      collection: 'list-workload',
      ...caller,
      listId,
      weekStart: query.weekStart,
      filter: taskFilterFingerprint(filter),
    };
    const result = await answerReportingRefusals(() =>
      this.workloadQuery.execute({
        ...caller,
        listId,
        weekStart: query.weekStart,
        filter,
        after: reportingPosition(query.cursor, scope),
        limit: query.limit,
      }),
    );
    return GetListWorkloadInternalResponse.parse({
      ...result,
      items: result.items.map(({ assigneeId, ...item }) => ({
        ...item,
        assignee: assigneeId === null ? null : { userId: assigneeId },
      })),
      nextCursor: reportingCursor(result.next, scope),
    });
  }

  /** Reads recorded time with a caller-scoped page position. */
  @Get(':listId/timesheet')
  public async timesheet(
    @Param() path: ListTasksPath,
    @Query() query: TimesheetQuery,
  ): Promise<z.output<typeof GetListTimesheetInternalResponse>> {
    const caller = toCaller();
    const listId = path.listId.toLowerCase();
    const scope = { collection: 'list-timesheet', ...caller, listId, weekStart: query.weekStart };
    const result = await answerReportingRefusals(() =>
      this.timesheetQuery.execute({
        ...caller,
        listId,
        weekStart: query.weekStart,
        after: reportingPosition(query.cursor, scope),
        limit: query.limit,
      }),
    );
    return GetListTimesheetInternalResponse.parse({
      ...result,
      items: result.items.map(({ authorUserId, ...item }) => ({
        ...item,
        author: { userId: authorUserId },
      })),
      nextCursor: reportingCursor(result.next, scope),
    });
  }

  /** Reads one page of the observed sprint history. */
  @Get(':listId/sprint-report')
  public async sprint(
    @Param() path: ListTasksPath,
    @Query() query: SprintReportQuery,
  ): Promise<z.output<typeof GetSprintReportInternalResponse>> {
    const caller = toCaller();
    const listId = path.listId.toLowerCase();
    const scope = {
      collection: 'sprint-report',
      ...caller,
      listId,
      today: query.today,
      timeZone: query.timeZone,
    };
    const result = await answerReportingRefusals(() =>
      this.sprintQuery.execute({
        ...caller,
        listId,
        today: query.today,
        timeZone: query.timeZone,
        serverObservedAt: new Date(),
        after: sprintReportPosition(query.cursor, scope),
        limit: query.limit,
      }),
    );
    return GetSprintReportInternalResponse.parse({
      ...result,
      observedAt: result.observedAt.toISOString(),
      coverageStartedAt: result.coverageStartedAt?.toISOString() ?? null,
      nextCursor: sprintReportCursor(result.next, scope),
    });
  }

  /** Produces authorized, escaped cells for the gateway's CSV download. */
  @Get(':listId/tasks/export')
  public async export(
    @Param() path: ListTasksPath,
    @Query() query: ExportQuery,
    @Res() response: Response,
  ): Promise<void> {
    const caller = toCaller();
    await writeTaskExport(response, (sink, signal) =>
      answerReportingRefusals(() =>
        this.exportQuery.execute(
          {
            ...caller,
            listId: path.listId.toLowerCase(),
            filter: toTaskFilterInput(query),
            order: toTaskOrder(query.sort),
            sheetSort:
              query.sheetSortColumn === undefined
                ? null
                : { column: query.sheetSortColumn, direction: query.sheetSortDirection ?? 'asc' },
            signal,
          },
          sink,
        ),
      ),
    );
  }
  // #endregion
}
