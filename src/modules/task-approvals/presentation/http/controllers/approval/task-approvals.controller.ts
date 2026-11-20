import type { TaskApprovalState } from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess, ZodValidationPipe } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { RequestTaskApproval } from '../../../../application/use-cases/commands/approval/request-task-approval/request-task-approval.use-case.js';
import { VoteOnTaskApproval } from '../../../../application/use-cases/commands/approval/vote-on-task-approval/vote-on-task-approval.use-case.js';
import { WithdrawTaskApprovalVote } from '../../../../application/use-cases/commands/approval/withdraw-task-approval-vote/withdraw-task-approval-vote.use-case.js';
import { GetTaskApproval } from '../../../../application/use-cases/queries/approval/get-task-approval/get-task-approval.use-case.js';
import { ApprovalRoundPath } from '../../dto/input/approval/approval-round-path.dto.js';
import { ApprovalTaskPath } from '../../dto/input/approval/approval-task-path.dto.js';
import { approvalVoteBodySchema } from '../../dto/input/approval/approval-vote-body.dto.js';
import type { ApprovalVoteBody } from '../../dto/input/approval/approval-vote-body.dto.js';
import { RequestApprovalBody } from '../../dto/input/approval/request-approval-body.dto.js';
import { answerApprovalRefusals } from '../../errors/approval/approval-refusal.problem.js';
import { approvalCaller } from '../../mappers/approval/approval-caller.mapper.js';
import { toApprovalState } from '../../mappers/approval/approval-state.mapper.js';
import { approvalExpectedVersion } from '../../mappers/approval/approval-version.mapper.js';

/** Task approval rounds and the current reviewer's decision. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TaskApprovalsController {
  // #region Constructor
  /** Binds the four approval operations. */
  public constructor(
    private readonly getApproval: GetTaskApproval,
    private readonly requestApproval: RequestTaskApproval,
    private readonly voteApproval: VoteOnTaskApproval,
    private readonly withdrawVote: WithdrawTaskApprovalVote,
  ) {}
  // #endregion

  // #region Methods
  /** Reads the current visible approval. */
  @Get(':taskKey/approvals')
  public async get(
    @Param() path: ApprovalTaskPath,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TaskApprovalState> {
    const state = await answerApprovalRefusals(() =>
      this.getApproval.execute({ ...approvalCaller(), taskKey: path.taskKey }),
    );
    response.setHeader('ETag', formatEtag(state.taskVersion));
    return toApprovalState(state);
  }

  /** Replaces the current round under the task's version. */
  @Post(':taskKey/approvals/request')
  @HttpCode(200)
  public async request(
    @Param() path: ApprovalTaskPath,
    @Body() body: RequestApprovalBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TaskApprovalState> {
    const expectedVersions = approvalExpectedVersion(ifMatch);
    const state = await answerApprovalRefusals(() =>
      this.requestApproval.execute({
        ...approvalCaller(),
        taskKey: path.taskKey,
        expectedVersions,
        reviewerUserIds: body.reviewerUserIds,
      }),
    );
    response.setHeader('ETag', formatEtag(state.taskVersion));
    return toApprovalState(state);
  }

  /** Records the caller's vote on the current round. */
  @Put(':taskKey/approvals/:roundId/votes/me')
  public async vote(
    @Param() path: ApprovalRoundPath,
    @Body(new ZodValidationPipe(approvalVoteBodySchema)) body: ApprovalVoteBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TaskApprovalState> {
    const expectedVersions = approvalExpectedVersion(ifMatch);
    const state = await answerApprovalRefusals(() =>
      this.voteApproval.execute({
        ...approvalCaller(),
        taskKey: path.taskKey,
        roundId: path.roundId.toLowerCase(),
        expectedVersions,
        vote: body,
      }),
    );
    response.setHeader('ETag', formatEtag(state.taskVersion));
    return toApprovalState(state);
  }

  /** Withdraws the caller's vote and returns the resulting task version. */
  @Delete(':taskKey/approvals/:roundId/votes/me')
  @HttpCode(204)
  public async withdraw(
    @Param() path: ApprovalRoundPath,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const expectedVersions = approvalExpectedVersion(ifMatch);
    const result = await answerApprovalRefusals(() =>
      this.withdrawVote.execute({
        ...approvalCaller(),
        taskKey: path.taskKey,
        roundId: path.roundId.toLowerCase(),
        expectedVersions,
      }),
    );
    response.setHeader('ETag', formatEtag(result.version));
  }
  // #endregion
}
