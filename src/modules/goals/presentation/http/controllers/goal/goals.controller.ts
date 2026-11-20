import type { Goal, GoalPage, GoalResult } from '@cadenway/contracts/types/internal/task-service';
import {
  CreateGoalInternalBody,
  CreateGoalInternalQueryParams,
  CreateGoalResultInternalBody,
  GetGoalInternalParams,
  GetGoalInternalQueryParams,
  GetGoalResultInternalParams,
  ListGoalsInternalQueryParams,
  UpdateGoalInternalBody,
  UpdateGoalResultInternalBody,
} from '@cadenway/contracts/validators/internal/task-service';
import { formatEtag, InternalAccess, ZodValidationPipe } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';

import { CreateGoal } from '../../../../application/use-cases/commands/goal/create-goal/create-goal.use-case.js';
import { CreateGoalResult } from '../../../../application/use-cases/commands/goal/create-goal-result/create-goal-result.use-case.js';
import { DeleteGoal } from '../../../../application/use-cases/commands/goal/delete-goal/delete-goal.use-case.js';
import { DeleteGoalResult } from '../../../../application/use-cases/commands/goal/delete-goal-result/delete-goal-result.use-case.js';
import { UpdateGoal } from '../../../../application/use-cases/commands/goal/update-goal/update-goal.use-case.js';
import { UpdateGoalResult } from '../../../../application/use-cases/commands/goal/update-goal-result/update-goal-result.use-case.js';
import { GetGoal } from '../../../../application/use-cases/queries/goal/get-goal/get-goal.use-case.js';
import { GetGoalResult } from '../../../../application/use-cases/queries/goal/get-goal-result/get-goal-result.use-case.js';
import { ListGoals } from '../../../../application/use-cases/queries/goal/list-goals/list-goals.use-case.js';
import { answerGoal } from '../../errors/goal/goal.problem.js';
import { GoalBodyGuard } from '../../guards/goal/goal-body.guard.js';
import { GoalReplayGuard } from '../../guards/goal/goal-replay.guard.js';
import {
  decodeGoalCursor,
  encodeGoalCursor,
  goalCaller,
  goalCursorScope,
  goalResponse,
  goalResult,
} from '../../mappers/goal/goal.mapper.js';
import { goalExpectedVersions } from '../../mappers/goal/goal-version.mapper.js';

/** Internal goal and key-result operations for a verified organization member. */
@Controller('internal/v1/goals')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class GoalsController {
  // #region Constructor
  /** Binds goal commands and queries. */
  public constructor(
    private readonly listing: ListGoals,
    private readonly creating: CreateGoal,
    private readonly getting: GetGoal,
    private readonly updating: UpdateGoal,
    private readonly deleting: DeleteGoal,
    private readonly creatingResult: CreateGoalResult,
    private readonly gettingResult: GetGoalResult,
    private readonly updatingResult: UpdateGoalResult,
    private readonly deletingResult: DeleteGoalResult,
  ) {}
  // #endregion

  // #region Methods
  /** Lists the visible quarter and its unpaginated summary. */
  @Get()
  public async list(
    @Query(new ZodValidationPipe(ListGoalsInternalQueryParams))
    query: z.output<typeof ListGoalsInternalQueryParams>,
  ): Promise<GoalPage> {
    const caller = goalCaller();
    const scope = goalCursorScope(caller, query.quarter, query.today);
    const page = await answerGoal(() =>
      this.listing.execute({
        ...caller,
        quarter: query.quarter,
        today: query.today,
        limit: query.limit,
        after: decodeGoalCursor(query.cursor, scope),
      }),
    );
    return {
      items: page.items.map(goalResponse),
      summary: page.summary,
      nextCursor: encodeGoalCursor(page.nextPosition, scope),
    };
  }

  /** Creates a goal and its initial results atomically. */
  @Post()
  @HttpCode(201)
  @UseGuards(GoalBodyGuard, GoalReplayGuard)
  public async create(
    @Query(new ZodValidationPipe(CreateGoalInternalQueryParams))
    query: z.output<typeof CreateGoalInternalQueryParams>,
    @Body(new ZodValidationPipe(CreateGoalInternalBody))
    body: z.output<typeof CreateGoalInternalBody>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Goal> {
    const goal = await answerGoal(() =>
      this.creating.execute({
        ...goalCaller(),
        ...body,
        spaceId: body.spaceId ?? null,
        results: body.results ?? [],
        today: query.today,
      }),
    );
    response.setHeader('ETag', formatEtag(goal.version));
    response.setHeader('Location', `/v1/goals/${goal.id}?today=${query.today}`);
    return goalResponse(goal);
  }

  /** Reads one visible goal. */
  @Get(':goalId')
  public async get(
    @Param(new ZodValidationPipe(GetGoalInternalParams))
    path: z.output<typeof GetGoalInternalParams>,
    @Query(new ZodValidationPipe(GetGoalInternalQueryParams))
    query: z.output<typeof GetGoalInternalQueryParams>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Goal> {
    const goal = await answerGoal(() =>
      this.getting.execute({
        ...goalCaller(),
        goalId: path.goalId.toLowerCase(),
        today: query.today,
      }),
    );
    response.setHeader('ETag', formatEtag(goal.version));
    return goalResponse(goal);
  }

  /** Updates a goal under an optional version condition. */
  @Patch(':goalId')
  @UseGuards(GoalBodyGuard)
  public async update(
    @Param(new ZodValidationPipe(GetGoalInternalParams))
    path: z.output<typeof GetGoalInternalParams>,
    @Query(new ZodValidationPipe(GetGoalInternalQueryParams))
    query: z.output<typeof GetGoalInternalQueryParams>,
    @Body(new ZodValidationPipe(UpdateGoalInternalBody))
    patch: z.output<typeof UpdateGoalInternalBody>,
    @Headers('if-match') version: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Goal> {
    const goal = await answerGoal(() =>
      this.updating.execute({
        ...goalCaller(),
        goalId: path.goalId.toLowerCase(),
        today: query.today,
        patch,
        expectedVersions: goalExpectedVersions(version),
      }),
    );
    response.setHeader('ETag', formatEtag(goal.version));
    return goalResponse(goal);
  }

  /** Deletes a goal and its results. */
  @Delete(':goalId')
  @HttpCode(204)
  public async delete(
    @Param(new ZodValidationPipe(GetGoalInternalParams))
    path: z.output<typeof GetGoalInternalParams>,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await answerGoal(() =>
      this.deleting.execute({
        ...goalCaller(),
        goalId: path.goalId.toLowerCase(),
        expectedVersions: goalExpectedVersions(version),
      }),
    );
  }

  /** Adds one result to a writable goal. */
  @Post(':goalId/results')
  @HttpCode(201)
  @UseGuards(GoalBodyGuard, GoalReplayGuard)
  public async createResult(
    @Param(new ZodValidationPipe(GetGoalInternalParams))
    path: z.output<typeof GetGoalInternalParams>,
    @Body(new ZodValidationPipe(CreateGoalResultInternalBody))
    result: z.output<typeof CreateGoalResultInternalBody>,
    @Headers('if-match') version: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GoalResult> {
    const answer = await answerGoal(() =>
      this.creatingResult.execute({
        ...goalCaller(),
        goalId: path.goalId.toLowerCase(),
        result,
        expectedVersions: goalExpectedVersions(version),
      }),
    );
    response.setHeader('ETag', formatEtag(answer.version));
    response.setHeader(
      'Location',
      `/v1/goals/${path.goalId.toLowerCase()}/results/${answer.result.id}`,
    );
    return goalResult(answer.result);
  }

  /** Reads one visible result. */
  @Get(':goalId/results/:resultId')
  public async getResult(
    @Param(new ZodValidationPipe(GetGoalResultInternalParams))
    path: z.output<typeof GetGoalResultInternalParams>,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GoalResult> {
    const answer = await answerGoal(() =>
      this.gettingResult.execute({
        ...goalCaller(),
        goalId: path.goalId.toLowerCase(),
        resultId: path.resultId.toLowerCase(),
      }),
    );
    response.setHeader('ETag', formatEtag(answer.version));
    return goalResult(answer.result);
  }

  /** Updates a visible result under the parent goal's version. */
  @Patch(':goalId/results/:resultId')
  @UseGuards(GoalBodyGuard)
  public async updateResult(
    @Param(new ZodValidationPipe(GetGoalResultInternalParams))
    path: z.output<typeof GetGoalResultInternalParams>,
    @Body(new ZodValidationPipe(UpdateGoalResultInternalBody))
    patch: z.output<typeof UpdateGoalResultInternalBody>,
    @Headers('if-match') version: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GoalResult> {
    const answer = await answerGoal(() =>
      this.updatingResult.execute({
        ...goalCaller(),
        goalId: path.goalId.toLowerCase(),
        resultId: path.resultId.toLowerCase(),
        patch,
        expectedVersions: goalExpectedVersions(version),
      }),
    );
    response.setHeader('ETag', formatEtag(answer.version));
    return goalResult(answer.result);
  }

  /** Removes a result from its parent goal. */
  @Delete(':goalId/results/:resultId')
  @HttpCode(204)
  public async deleteResult(
    @Param(new ZodValidationPipe(GetGoalResultInternalParams))
    path: z.output<typeof GetGoalResultInternalParams>,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await answerGoal(() =>
      this.deletingResult.execute({
        ...goalCaller(),
        goalId: path.goalId.toLowerCase(),
        resultId: path.resultId.toLowerCase(),
        expectedVersions: goalExpectedVersions(version),
      }),
    );
  }
  // #endregion
}
