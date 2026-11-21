import { ProblemException, toProblem } from '@cadenway/nest-common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const actionPath =
  /^\/internal\/v1\/tasks\/[^/]+\/(?:automation-actions|automation-comments|automation-notification-authorization|git-status-actions)\/?$/iu;
const automationBodyPath =
  /^\/internal\/v1\/tasks\/[^/]+\/(?:automation-comments|automation-notification-authorization)\/?$/iu;

/** Marks delegated action receipts and early refusals private. */
export function configureTaskActionCache(app: Pick<NestExpressApplication, 'use'>): void {
  app.use(actionPath, (_request: Request, response: Response, next: NextFunction): void => {
    response.setHeader('Cache-Control', 'private, no-store');
    next();
  });
  app.use(
    automationBodyPath,
    (error: unknown, _request: Request, _response: Response, next: NextFunction): void => {
      const problem = toProblem(error);
      if (problem.status !== 400 || problem.code === 'request.invalid') {
        next(error);
        return;
      }
      next(
        new ProblemException({
          status: 400,
          code: 'request.invalid',
          details: { issues: [{ in: 'body', path: '', code: 'invalid_format' }] },
        }),
      );
    },
  );
  app.use(
    actionPath,
    (error: unknown, _request: Request, response: Response, next: NextFunction): void => {
      response.setHeader('Cache-Control', 'private, no-store');
      next(error);
    },
  );
}
