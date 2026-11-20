import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { invalidRequest } from '../../errors/view/saved-view.problem.js';

/** Checks body presence before interceptors may replay a saved-view creation. */
@Injectable()
export class RequiredSavedViewBodyGuard implements CanActivate {
  // #region Methods
  /** Distinguishes a literal JSON object from an empty body normalized by the parser. */
  public canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const length = request.headers['content-length'];
    if (
      !request.is('application/json') ||
      Number(length) === 0 ||
      (length === undefined && !request.readableDidRead)
    ) {
      throw invalidRequest('body', '', 'required', 'Expected a JSON object.');
    }
    return true;
  }
  // #endregion
}
