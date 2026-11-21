import { CreateTaskCommentInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { principalOf, ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { CreateComment } from '../../../../application/use-cases/commands/comment/create-comment/create-comment.use-case.js';
import { toCommentReadInput } from '../../mappers/comment/comment-caller.mapper.js';
import { commentProblem } from '../../mappers/comment/comment-refusal.mapper.js';

/** Rechecks task access before an idempotency receipt can be replayed. */
@Injectable()
export class CommentReplayAccessGuard implements CanActivate {
  // #region Constructor
  /** Uses the comment creation authorization path. */
  public constructor(private readonly comments: CreateComment) {}
  // #endregion

  // #region Methods
  /** Leaves malformed paths to the normal request validation. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers['idempotency-key'] === undefined) return true;
    const path = CreateTaskCommentInternalParams.safeParse(request.params);
    if (!path.success) return true;
    const principal = principalOf(request);
    if (principal === undefined)
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    try {
      await runWithOrganizationContext(principal, () =>
        this.comments.authorizeUser(toCommentReadInput(path.data.taskKey)),
      );
      return true;
    } catch (error: unknown) {
      throw commentProblem(error, path.data.taskKey);
    }
  }
  // #endregion
}
