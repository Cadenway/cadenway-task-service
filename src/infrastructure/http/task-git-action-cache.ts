import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const actionPath = /^\/internal\/v1\/tasks\/[^/]+\/git-status-actions\/?$/iu;

/** Keeps the authorization response and command receipt private even before the route runs. */
export function configureTaskGitActionCache(app: Pick<NestExpressApplication, 'use'>): void {
  app.use(actionPath, (_request: Request, response: Response, next: NextFunction): void => {
    response.setHeader('Cache-Control', 'private, no-store');
    next();
  });
  app.use(
    actionPath,
    (error: unknown, _request: Request, response: Response, next: NextFunction): void => {
      response.setHeader('Cache-Control', 'private, no-store');
      next(error);
    },
  );
}
