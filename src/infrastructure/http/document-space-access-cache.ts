import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

const documentSpaceAccessPath = /^\/internal\/v1\/spaces\/access\/resolve\/?$/iu;

/** Prevents caching of the live scope proof and any error before its route is dispatched. */
export function configureDocumentSpaceAccessCache(app: Pick<NestExpressApplication, 'use'>): void {
  app.use(documentSpaceAccessPath, (_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    documentSpaceAccessPath,
    (error: unknown, _request: Request, response: Response, next: NextFunction): void => {
      response.setHeader('Cache-Control', 'no-store');
      next(error);
    },
  );
}
