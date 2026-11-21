import { ProblemException, ProblemFilter } from '@cadenway/nest-common';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';

/** Keeps client refusals private and conceals errors from the current access snapshot. */
@Catch()
export class AutomationNotificationAuthorizationFilter extends ProblemFilter {
  // #region Methods
  /** Writes the contract's private response and sanitizes dependency failures. */
  public override catch(exception: unknown, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'private, no-store');
    const problem =
      exception instanceof HttpException && exception.getStatus() < 500
        ? exception
        : new ProblemException({
            status: 503,
            code: 'task.notification-authorization-unavailable',
            title: 'Notification authorization unavailable.',
          });
    super.catch(problem, host);
  }
  // #endregion
}
