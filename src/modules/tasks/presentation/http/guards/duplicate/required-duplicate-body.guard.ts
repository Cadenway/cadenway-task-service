import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { requireDuplicateBody } from '../../validation/duplicate/required-duplicate-body.validator.js';

/** Checks body presence before interceptors may replay an idempotent response. */
@Injectable()
export class RequiredDuplicateBodyGuard implements CanActivate {
  // #region Methods
  /** Requires a non-empty JSON request before idempotency interception. */
  public canActivate(context: ExecutionContext): boolean {
    requireDuplicateBody(context.switchToHttp().getRequest<Request>());
    return true;
  }
  // #endregion
}
