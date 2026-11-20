import type { MilestonePage } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param, Query } from '@nestjs/common';

import { ListSpaceMilestones } from '../../../../application/use-cases/queries/space/list-space-milestones/list-space-milestones.use-case.js';
import { SpaceMilestonesPath } from '../../dto/input/milestone/space-milestones-path.dto.js';
import { SpaceMilestonesQuery } from '../../dto/input/milestone/space-milestones-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import {
  decodeMilestoneCursor,
  encodeMilestoneCursor,
} from '../../mappers/milestone/space-milestone-cursor.mapper.js';
import { toTaskSummary } from '../../mappers/task/task-summary.mapper.js';

/** Serves the contract's space milestone page to an authenticated gateway caller. */
@Controller('internal/v1/spaces')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class SpaceMilestonesController {
  // #region Constructor
  /** Binds the visible milestone query. */
  public constructor(private readonly milestones: ListSpaceMilestones) {}
  // #endregion

  // #region Methods
  /** Returns the visible milestones, without supplying a task ETag. */
  @Get(':spaceId/milestones')
  public async list(
    @Param() path: SpaceMilestonesPath,
    @Query() query: SpaceMilestonesQuery,
  ): Promise<MilestonePage> {
    const caller = toCaller();
    const spaceId = path.spaceId.toLowerCase();
    const collection = {
      organizationId: caller.organizationId,
      spaceId,
      order: 'milestone-due-date-asc-null-last-id-asc',
    };
    const page = await answerRefusals(() =>
      this.milestones.execute({
        ...caller,
        spaceId,
        after: decodeMilestoneCursor(query.cursor, collection),
        limit: query.limit,
      }),
    );
    return {
      items: page.items.map((item): MilestonePage['items'][number] => ({
        ...toTaskSummary(item),
        milestone: true,
      })),
      nextCursor: encodeMilestoneCursor(page.next, collection),
      total: page.total,
    };
  }
  // #endregion
}
