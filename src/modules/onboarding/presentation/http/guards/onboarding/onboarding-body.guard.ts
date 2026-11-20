import { ProblemException } from '@cadenway/nest-common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

/** Rejects a missing JSON body before an idempotent response can be replayed. */
@Injectable()
export class OnboardingBodyGuard implements CanActivate {
  // #region Methods
  /** Requires a JSON body. */
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const length = request.headers['content-length'];
    if (
      !request.is('application/json') ||
      Number(length) === 0 ||
      (length === undefined && !request.readableDidRead)
    ) {
      throw new ProblemException({
        status: 400,
        code: 'request.invalid',
        details: {
          issues: [{ in: 'body', path: '', code: 'required', message: 'Expected a JSON body.' }],
        },
      });
    }
    return true;
  }
  // #endregion
}
