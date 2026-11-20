import type {
  Dependency,
  DependencyPage,
  TaskSummaryPage,
} from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import type { DependencyView } from '../../../../application/projections/dependency/dependency.projection.js';
import { CreateTaskDependency } from '../../../../application/use-cases/commands/dependency/create-task-dependency/create-task-dependency.use-case.js';
import { DeleteTaskDependency } from '../../../../application/use-cases/commands/dependency/delete-task-dependency/delete-task-dependency.use-case.js';
import { GetTaskDependency } from '../../../../application/use-cases/queries/dependency/get-task-dependency/get-task-dependency.use-case.js';
import { ListDependencyCandidates } from '../../../../application/use-cases/queries/dependency/list-dependency-candidates/list-dependency-candidates.use-case.js';
import { ListTaskDependencies } from '../../../../application/use-cases/queries/dependency/list-task-dependencies/list-task-dependencies.use-case.js';
import { CreateDependencyBody } from '../../dto/input/dependency/create-dependency-body.dto.js';
import { DependencyPath } from '../../dto/input/dependency/dependency-path.dto.js';
import { ListDependenciesQuery } from '../../dto/input/dependency/list-dependencies-query.dto.js';
import { ListDependencyCandidatesQuery } from '../../dto/input/dependency/list-dependency-candidates-query.dto.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import {
  toCandidateCursor,
  toCandidatePosition,
  toDependencyCursor,
  toDependencyPosition,
} from '../../mappers/dependency/dependency-cursor.mapper.js';
import { toTaskSummary } from '../../mappers/task/task-summary.mapper.js';
import { toExpectedVersions } from '../../mappers/version/expected-versions.mapper.js';

/** Maps a visible dependency without exposing either task's internal identifier. */
function toDependency(view: DependencyView): Dependency {
  return {
    id: view.id,
    blocker: toTaskSummary(view.blocker),
    blocked: toTaskSummary(view.blocked),
  };
}

/**
 * Exposes task dependencies to the API gateway within the authenticated organization.
 * Visibility, editing permissions, the graph transaction and events belong to the use cases.
 */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskDependenciesController {
  // #region Constructor
  /** Binds the five dependency operations. */
  public constructor(
    private readonly createDependency: CreateTaskDependency,
    private readonly deleteDependency: DeleteTaskDependency,
    private readonly getDependency: GetTaskDependency,
    private readonly listDependencies: ListTaskDependencies,
    private readonly listCandidates: ListDependencyCandidates,
  ) {}
  // #endregion

  // #region Methods
  /** Lists the visible dependencies of the anchor in creation order. */
  @Get(':taskKey/dependencies')
  public async list(
    @Param() path: TaskPath,
    @Query() query: ListDependenciesQuery,
  ): Promise<DependencyPage> {
    const caller = toCaller();
    const scope = { organizationId: caller.organizationId, taskKey: path.taskKey };
    const page = await answerRefusals(() =>
      this.listDependencies.execute({
        ...caller,
        taskKey: path.taskKey,
        after: toDependencyPosition(query.cursor, scope),
        limit: query.limit,
      }),
    );
    return {
      items: page.items.map(toDependency),
      nextCursor: toDependencyCursor(page.next, scope),
    };
  }

  /** Creates an edge and returns its location and the anchor's new ETag. */
  @Post(':taskKey/dependencies')
  @HttpCode(201)
  public async create(
    @Param() path: TaskPath,
    @Body() body: CreateDependencyBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Dependency> {
    const result = await answerRefusals(() =>
      this.createDependency.execute({
        ...toCaller(),
        taskKey: path.taskKey,
        otherTaskKey: body.otherTaskKey,
        direction: body.direction,
        expectedVersions: toExpectedVersions(ifMatch),
      }),
    );
    response.setHeader(
      'Location',
      `/internal/v1/tasks/${path.taskKey}/dependencies/${result.dependency.id}`,
    );
    response.setHeader('ETag', formatEtag(result.version));
    return toDependency(result.dependency);
  }

  /** Reads a dependency when the anchor and the live counterpart are visible. */
  @Get(':taskKey/dependencies/:dependencyId')
  public async get(@Param() path: DependencyPath): Promise<Dependency> {
    const view = await answerRefusals(() =>
      this.getDependency.execute({
        ...toCaller(),
        taskKey: path.taskKey,
        dependencyId: path.dependencyId.toLowerCase(),
      }),
    );
    return toDependency(view);
  }

  /** Removes an editable dependency, returning the anchor's new ETag. */
  @Delete(':taskKey/dependencies/:dependencyId')
  @HttpCode(204)
  public async remove(
    @Param() path: DependencyPath,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = await answerRefusals(() =>
      this.deleteDependency.execute({
        ...toCaller(),
        taskKey: path.taskKey,
        dependencyId: path.dependencyId.toLowerCase(),
        expectedVersions: toExpectedVersions(ifMatch),
      }),
    );
    response.setHeader('ETag', formatEtag(result.version));
  }

  /** Lists editable candidate tasks, with the anchor's list first. */
  @Get(':taskKey/dependency-candidates')
  public async candidates(
    @Param() path: TaskPath,
    @Query() query: ListDependencyCandidatesQuery,
  ): Promise<TaskSummaryPage> {
    const caller = toCaller();
    const scope = { organizationId: caller.organizationId, taskKey: path.taskKey };
    const search: string | null = query.search ?? null;
    const page = await answerRefusals(() =>
      this.listCandidates.execute({
        ...caller,
        taskKey: path.taskKey,
        direction: query.direction,
        search,
        after: toCandidatePosition(query.cursor, scope, query.direction, search),
        limit: query.limit,
      }),
    );
    return {
      items: page.items.map(toTaskSummary),
      nextCursor: toCandidateCursor(page.next, scope, query.direction, search),
      total: page.total,
    };
  }
  // #endregion
}
