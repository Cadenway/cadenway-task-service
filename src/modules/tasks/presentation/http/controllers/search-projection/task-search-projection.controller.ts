import type {
  SearchProjectionDecisions,
  SearchProjectionPage,
} from '@cadenway/contracts/types/internal/task-service';
import {
  ListTaskSearchProjectionsInternalResponse,
  ResolveTaskSearchProjectionsInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { InternalAccess, ProblemException, requireOrganizationId } from '@cadenway/nest-common';
import { Body, Controller, Get, Header, HttpCode, Post, Query, UseGuards } from '@nestjs/common';

import { ListTaskSearchProjections } from '../../../../application/use-cases/queries/search-projection/list-task-search-projections/list-task-search-projections.use-case.js';
import { ResolveTaskSearchProjections } from '../../../../application/use-cases/queries/search-projection/resolve-task-search-projections/resolve-task-search-projections.use-case.js';
import { TaskSearchProjectionLookup } from '../../dto/input/search-projection/task-search-projection-lookup.dto.js';
import { TaskSearchProjectionQuery } from '../../dto/input/search-projection/task-search-projection-query.dto.js';
import { TaskSearchProjectionActorGuard } from '../../guards/search-projection/task-search-projection-actor.guard.js';

function invalidRequest(location: 'query' | 'body', path: string, message: string): never {
  throw new ProblemException({
    status: 400,
    code: 'request.invalid',
    detail: 'The request does not match its contract.',
    details: { issues: [{ in: location, path, code: 'custom', message }] },
  });
}

function projectionUnavailable(cause?: unknown): never {
  throw new ProblemException({ status: 503, code: 'task.projection-unavailable', cause });
}

/** Exports and resolves authoritative projections for the signed Search system actor. */
@Controller('internal/v1/task-search-projections')
@InternalAccess({ issuers: ['search-service'], actors: ['system'], organization: 'required' })
@UseGuards(TaskSearchProjectionActorGuard)
export class TaskSearchProjectionController {
  // #region Constructor
  /** Binds the Task source queries. */
  public constructor(
    private readonly listSearchProjections: ListTaskSearchProjections,
    private readonly resolveSearchProjections: ResolveTaskSearchProjections,
  ) {}
  // #endregion

  // #region Methods
  /** Reads one page of current active projections within the signed organization. */
  @Get()
  @Header('Cache-Control', 'private, no-store')
  public async list(@Query() query: TaskSearchProjectionQuery): Promise<SearchProjectionPage> {
    const result = await this.listSearchProjections
      .execute({
        organizationId: requireOrganizationId().toLowerCase(),
        scope: {
          kind: query.kind,
          spaceId: query.spaceId?.toLowerCase() ?? null,
          listId: query.listId?.toLowerCase() ?? null,
        },
        cursor: query.cursor ?? null,
        limit: query.limit,
      })
      .catch(projectionUnavailable);
    if (result.outcome === 'page') {
      const response = ListTaskSearchProjectionsInternalResponse.safeParse({
        items: result.items,
        nextCursor: result.nextCursor,
      });
      if (response.success) return response.data;
    }
    if (result.outcome === 'invalid-cursor') {
      invalidRequest('query', 'cursor', 'Expected a cursor for this projection scope.');
    }
    return projectionUnavailable();
  }

  /** Resolves every submitted identifier against the current signed-tenant snapshot. */
  @Post('resolve')
  @HttpCode(200)
  @Header('Cache-Control', 'private, no-store')
  public async resolve(
    @Body() body: TaskSearchProjectionLookup,
  ): Promise<SearchProjectionDecisions> {
    const result = await this.resolveSearchProjections
      .execute({
        organizationId: requireOrganizationId().toLowerCase(),
        kind: body.kind,
        ids: body.ids,
      })
      .catch(projectionUnavailable);
    if (result.outcome === 'resolved') {
      const response = ResolveTaskSearchProjectionsInternalResponse.safeParse({
        results: result.results,
      });
      if (response.success) return response.data;
    }
    if (result.outcome === 'duplicate-ids') {
      invalidRequest('body', 'ids', 'Projection identifiers must be unique.');
    }
    if (result.outcome === 'batch-too-large') {
      throw new ProblemException({ status: 422, code: 'task.projection-batch-too-large' });
    }
    return projectionUnavailable();
  }
  // #endregion
}
