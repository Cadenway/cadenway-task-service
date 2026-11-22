import { principalOf, ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import { IDEMPOTENT_REPLAYED_HEADER } from '@cadenway/nest-common/database';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { mergeMap } from 'rxjs';
import type { Observable } from 'rxjs';

/**
 * Checks permission to return a stored receipt after the kit has loaded it.
 * A creation route can conceal a missing resource with its own published problem.
 */
export function authorizeIdempotentReplay(
  context: ExecutionContext,
  next: CallHandler,
  missingCode: string,
  authorize: (request: Request, body: unknown) => Promise<void>,
  concealResourceWithStatus?: 403 | 404,
): Observable<unknown> {
  const request = context.switchToHttp().getRequest<Request>();
  const response = context.switchToHttp().getResponse<Response>();
  return next.handle().pipe(
    mergeMap(async (body: unknown): Promise<unknown> => {
      if (response.getHeader(IDEMPOTENT_REPLAYED_HEADER) !== 'true') return body;

      try {
        const principal = principalOf(request);
        if (principal === undefined) {
          throw new ProblemException({
            status: concealResourceWithStatus ?? 404,
            code: missingCode,
          });
        }
        await runWithOrganizationContext(principal, () => authorize(request, body));
        return body;
      } catch (error: unknown) {
        response.removeHeader('Location');
        response.removeHeader('ETag');
        response.removeHeader(IDEMPOTENT_REPLAYED_HEADER);
        if (
          concealResourceWithStatus !== undefined &&
          error instanceof ProblemException &&
          error.problem.status === 404 &&
          error.problem.code !== 'organization.not-found'
        ) {
          throw new ProblemException({ status: concealResourceWithStatus, code: missingCode });
        }
        throw error;
      }
    }),
  );
}
