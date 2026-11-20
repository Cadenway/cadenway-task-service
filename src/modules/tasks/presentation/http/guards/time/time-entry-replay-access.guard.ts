import { principalOf, ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { CreateTaskTimeEntry } from '../../../../application/use-cases/commands/time/create-task-time-entry/create-task-time-entry.use-case.js';
import { TaskPath } from '../../dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/** Rechecks current access before the idempotency interceptor can replay a creation. */
@Injectable()
export class TimeEntryReplayAccessGuard implements CanActivate {
  // #region Constructor
  /** Binds the creation access check. */
  public constructor(private readonly createTimeEntry: CreateTaskTimeEntry) {}
  // #endregion

  // #region Methods
  /** Allows normal parameter validation to report an invalid task key. */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers['idempotency-key'] === undefined) return true;
    const path = TaskPath.schema.safeParse(request.params);
    if (!path.success) return true;
    const principal = principalOf(request);
    if (principal === undefined) {
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    }
    await runWithOrganizationContext(principal, () =>
      answerRefusals(() =>
        this.createTimeEntry.assertCanReplay({ ...toCaller(), taskKey: path.data.taskKey }),
      ),
    );
    return true;
  }
  // #endregion
}
