import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const taskSearchPath =
  /^\/internal\/v1\/(?:task-search-projections(?:\/resolve)?|task-search-access\/resolve)\/?$/iu;
const taskSearchExportPath = /^\/internal\/v1\/task-search-projections\/?$/iu;

/** Keeps Task Search responses private, including errors raised by the parser and token guard. */
export function configureTaskSearchCache(app: Pick<NestExpressApplication, 'use'>): void {
  app.use(taskSearchPath, (request: Request, response: Response, next: NextFunction): void => {
    response.setHeader('Cache-Control', 'private, no-store');
    if (
      (request.method === 'GET' || request.method === 'HEAD') &&
      taskSearchExportPath.test(request.baseUrl)
    ) {
      // Express can turn a complete proof into a 304 even with a no-store response.
      delete request.headers['if-none-match'];
      delete request.headers['if-modified-since'];
    }
    next();
  });
  app.use(
    taskSearchPath,
    (error: unknown, _request: Request, response: Response, next: NextFunction): void => {
      response.setHeader('Cache-Control', 'private, no-store');
      next(error);
    },
  );
}
