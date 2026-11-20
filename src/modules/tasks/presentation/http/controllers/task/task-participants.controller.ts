import type { TaskParticipantPage } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param, Query } from '@nestjs/common';

import { ListTaskParticipants } from '../../../../application/use-cases/queries/task/list-task-participants/list-task-participants.use-case.js';
import { ListTaskParticipantsQuery } from '../../dto/input/task/list-task-participants-query.dto.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import {
  decodeParticipantCursor,
  encodeParticipantCursor,
} from '../../mappers/task/task-participants-cursor.mapper.js';

/** Internal participant enumeration for task comment and mention pickers. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskParticipantsController {
  // #region Properties
  /** Participant page query. */
  private readonly participants: ListTaskParticipants;
  // #endregion

  // #region Constructor
  /** Binds the participant query. */
  public constructor(participants: ListTaskParticipants) {
    this.participants = participants;
  }
  // #endregion

  // #region Methods
  /** Returns only eligible current account and membership IDs. */
  @Get(':taskKey/participants')
  public async list(
    @Param() path: TaskPath,
    @Query() query: ListTaskParticipantsQuery,
  ): Promise<TaskParticipantPage> {
    const caller = toCaller();
    const filters = { organizationId: caller.organizationId, taskKey: path.taskKey };
    const after = decodeParticipantCursor(query.cursor, filters);
    const page = await answerRefusals(() =>
      this.participants.execute({ ...caller, taskKey: path.taskKey, after, limit: query.limit }),
    );
    return {
      items: page.items.map(({ userId, memberId }) => ({ userId, memberId })),
      nextCursor: encodeParticipantCursor(page.next, filters),
    };
  }
  // #endregion
}
