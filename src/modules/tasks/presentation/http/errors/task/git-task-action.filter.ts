import { ProblemException, ProblemFilter } from '@cadenway/nest-common';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';

/** Keeps typed HTTP refusals and sanitizes unexpected failures across the action pipeline. */
@Catch()
export class GitTaskActionFilter extends ProblemFilter {
  // #region Methods
  /** Delegates the contract problem to the common HTTP filter. */
  public override catch(exception: unknown, host: ArgumentsHost): void {
    const problem =
      exception instanceof ProblemException ||
      (exception instanceof HttpException && exception.getStatus() < 500)
        ? exception
        : new ProblemException({ status: 503, code: 'task.action-unavailable' });
    super.catch(problem, host);
  }
  // #endregion
}
