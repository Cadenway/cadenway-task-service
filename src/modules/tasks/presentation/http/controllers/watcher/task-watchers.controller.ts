import type { Watcher, WatcherPage } from '@cadenway/contracts/types/internal/task-service';
import {
  decodeCursor,
  encodeCursor,
  formatEtag,
  InternalAccess,
  ProblemException,
} from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SetTaskWatcher } from '../../../../application/use-cases/commands/watcher/set-task-watcher/set-task-watcher.use-case.js';
import type { SetTaskWatcherOutput } from '../../../../application/use-cases/commands/watcher/set-task-watcher/set-task-watcher.output.js';
import { ListWatchers } from '../../../../application/use-cases/queries/watcher/list-watchers/list-watchers.use-case.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { FollowWatcherBody } from '../../dto/input/watcher/follow-watcher-body.dto.js';
import { WatcherPath } from '../../dto/input/watcher/watcher-path.dto.js';
import { WatchersQuery } from '../../dto/input/watcher/watchers-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { invalidCursor, isRowId } from '../../mappers/page/page-cursor.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/** Serves the task's watcher page and explicit subscription overrides for verified users. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskWatchersController {
  // #region Properties
  /** Current eligible subscriptions. */
  private readonly listWatchers: ListWatchers;

  /** Updates an explicit follow or unfollow. */
  private readonly setWatcher: SetTaskWatcher;
  // #endregion

  // #region Constructor
  /** Binds the application operations. */
  public constructor(listWatchers: ListWatchers, setWatcher: SetTaskWatcher) {
    this.listWatchers = listWatchers;
    this.setWatcher = setWatcher;
  }
  // #endregion

  // #region Methods
  /** Returns the IDs that currently qualify to watch the task, paginated by ID. */
  @Get(':taskKey/watchers')
  public async list(@Param() path: TaskPath, @Query() query: WatchersQuery): Promise<WatcherPage> {
    const caller = toCaller();
    const filters = {
      organizationId: caller.organizationId,
      taskKey: path.taskKey,
      order: 'watcher-user-id-asc',
    };
    const position = query.cursor === undefined ? null : decodeCursor(query.cursor, filters);
    if (position !== null && (position.sort.length !== 0 || !isRowId(position.id))) {
      throw invalidCursor();
    }
    const page = await answerRefusals(() =>
      this.listWatchers.execute({
        ...caller,
        taskKey: path.taskKey,
        after: position?.id.toLowerCase() ?? null,
        limit: query.limit,
      }),
    );
    return {
      items: page.userIds.map((userId) => ({ userId })),
      nextCursor: page.next === null ? null : encodeCursor({ sort: [], id: page.next }, filters),
      total: page.total,
      callerFollows: page.callerFollows,
    };
  }

  /** Stores an explicit follow and returns the subject ID and the task version ETag. */
  @Put(':taskKey/watchers/:userId')
  public async follow(
    @Param() path: WatcherPath,
    @Body() _body: FollowWatcherBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Watcher> {
    // The shared parser can assign {} to a declared zero-byte JSON input.
    if (!request.is('application/json') || request.headers['content-length'] === '0') {
      throw new ProblemException({
        status: 400,
        code: 'request.invalid',
        detail: 'The request does not match its contract.',
        details: {
          issues: [
            { in: 'body', path: '', code: 'required', message: 'Expected an empty JSON object.' },
          ],
        },
      });
    }
    const result = await this.change(path, ifMatch, true);
    response.setHeader('ETag', formatEtag(result.version));
    return { userId: result.userId };
  }

  /** Stores an explicit opt-out and returns only the task version ETag. */
  @Delete(':taskKey/watchers/:userId')
  @HttpCode(204)
  public async unfollow(
    @Param() path: WatcherPath,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = await this.change(path, ifMatch, false);
    response.setHeader('ETag', formatEtag(result.version));
  }

  /** Maps the common input of the two explicit subscription writes. */
  private change(
    path: WatcherPath,
    ifMatch: string | undefined,
    following: boolean,
  ): Promise<SetTaskWatcherOutput> {
    return answerRefusals(() =>
      this.setWatcher.execute({
        ...toCaller(),
        taskKey: path.taskKey,
        userId: path.userId,
        expectedVersions: toExpectedVersions(ifMatch),
        following,
      }),
    );
  }
  // #endregion
}
