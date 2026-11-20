import type {
  TaskStatusDurationResult,
  TaskTimeEntry,
  TaskTimeEntryPage,
  TaskTimeSummary,
} from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CreateTaskTimeEntry } from '../../../../application/use-cases/commands/time/create-task-time-entry/create-task-time-entry.use-case.js';
import { DeleteTaskTimeEntry } from '../../../../application/use-cases/commands/time/delete-task-time-entry/delete-task-time-entry.use-case.js';
import { GetTaskStatusDurations } from '../../../../application/use-cases/queries/time/get-task-status-durations/get-task-status-durations.use-case.js';
import { GetTaskTimeEntry } from '../../../../application/use-cases/queries/time/get-task-time-entry/get-task-time-entry.use-case.js';
import { GetTaskTimeSummary } from '../../../../application/use-cases/queries/time/get-task-time-summary/get-task-time-summary.use-case.js';
import { ListTaskTimeEntries } from '../../../../application/use-cases/queries/time/list-task-time-entries/list-task-time-entries.use-case.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { CreateTimeEntryBody } from '../../dto/input/time/create-time-entry-body.dto.js';
import { TimeEntriesQuery } from '../../dto/input/time/time-entries-query.dto.js';
import { TimeEntryPath } from '../../dto/input/time/time-entry-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { RequiredDuplicateBodyGuard } from '../../guards/duplicate/required-duplicate-body.guard.js';
import { TimeEntryReplayAccessGuard } from '../../guards/time/time-entry-replay-access.guard.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toCursor, toPosition } from '../../mappers/page/page-cursor.mapper.js';
import { toTaskTimeEntry } from '../../mappers/time/task-time-entry.mapper.js';

/** Time entries and measured status durations for a visible task. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskTimeController {
  // #region Constructor
  /** Binds the task time operations. */
  public constructor(
    private readonly createTimeEntry: CreateTaskTimeEntry,
    private readonly listTimeEntries: ListTaskTimeEntries,
    private readonly getTimeEntry: GetTaskTimeEntry,
    private readonly deleteTimeEntry: DeleteTaskTimeEntry,
    private readonly getTimeSummary: GetTaskTimeSummary,
    private readonly getStatusDurations: GetTaskStatusDurations,
  ) {}
  // #endregion

  // #region Methods
  /** Lists entries and totals, binding the cursor to the organization and task. */
  @Get(':taskKey/time-entries')
  public async list(
    @Param() path: TaskPath,
    @Query() query: TimeEntriesQuery,
  ): Promise<TaskTimeEntryPage> {
    const caller = toCaller();
    const scope = {
      collection: 'task-time-entries',
      organizationId: caller.organizationId,
      taskKey: path.taskKey,
    };
    const page = await answerRefusals(() =>
      this.listTimeEntries.execute({
        ...caller,
        taskKey: path.taskKey,
        after: toPosition(query.cursor, scope),
        limit: query.limit,
      }),
    );
    return {
      items: page.items.map(toTaskTimeEntry),
      nextCursor: toCursor(page.next, scope),
      total: page.total,
      totalMinutes: page.totalMinutes,
    };
  }

  /** Records a work log for the verified actor. */
  @Post(':taskKey/time-entries')
  @HttpCode(201)
  @UseGuards(RequiredDuplicateBodyGuard, TimeEntryReplayAccessGuard)
  public async create(
    @Param() path: TaskPath,
    @Body() body: CreateTimeEntryBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TaskTimeEntry> {
    const entry = await answerRefusals(() =>
      this.createTimeEntry.execute({
        ...toCaller(),
        taskKey: path.taskKey,
        minutes: body.minutes,
        workDate: body.workDate,
        note: body.note ?? null,
      }),
    );
    response.setHeader('Location', `/internal/v1/tasks/${path.taskKey}/time-entries/${entry.id}`);
    return toTaskTimeEntry(entry);
  }

  /** Reads a particular entry from the visible task. */
  @Get(':taskKey/time-entries/:timeEntryId')
  public async get(@Param() path: TimeEntryPath): Promise<TaskTimeEntry> {
    const entry = await answerRefusals(() =>
      this.getTimeEntry.execute({
        ...toCaller(),
        taskKey: path.taskKey,
        timeEntryId: path.timeEntryId.toLowerCase(),
      }),
    );
    return toTaskTimeEntry(entry);
  }

  /** Removes an entry after the use case checks its author and task access. */
  @Delete(':taskKey/time-entries/:timeEntryId')
  @HttpCode(204)
  public async remove(@Param() path: TimeEntryPath): Promise<void> {
    await answerRefusals(() =>
      this.deleteTimeEntry.execute({
        ...toCaller(),
        taskKey: path.taskKey,
        timeEntryId: path.timeEntryId.toLowerCase(),
      }),
    );
  }

  /** Returns the task's recorded minutes and estimate. */
  @Get(':taskKey/time-summary')
  public async summary(@Param() path: TaskPath): Promise<TaskTimeSummary> {
    const result = await answerRefusals(() =>
      this.getTimeSummary.execute({
        ...toCaller(),
        taskKey: path.taskKey,
      }),
    );
    return { totalMinutes: result.totalMinutes, estimateMinutes: result.estimateMinutes };
  }

  /** Returns the elapsed status history at one observation instant. */
  @Get(':taskKey/status-durations')
  public async durations(@Param() path: TaskPath): Promise<TaskStatusDurationResult> {
    const result = await answerRefusals(() =>
      this.getStatusDurations.execute({
        ...toCaller(),
        taskKey: path.taskKey,
      }),
    );
    const summary = result.summary;
    return {
      summary:
        summary === null
          ? null
          : {
              observedAt: summary.observedAt.toISOString(),
              coverageStartedAt: summary.coverageStartedAt.toISOString(),
              complete: summary.complete,
              durations: summary.durations.map(({ status, durationMilliseconds, active }) => ({
                status,
                durationMilliseconds,
                active,
              })),
            },
    };
  }
  // #endregion
}
