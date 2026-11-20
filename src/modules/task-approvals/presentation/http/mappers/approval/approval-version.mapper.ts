import { RequestTaskApprovalInternalHeader } from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException } from '@cadenway/nest-common';

/** Requires the single strong task ETag specified for approval writes. */
export function approvalExpectedVersion(header: string | undefined): readonly number[] {
  const result = RequestTaskApprovalInternalHeader.safeParse({ 'If-Match': header });
  const version = result.success ? Number(header?.slice(1, -1)) : NaN;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      details: {
        issues: [
          {
            in: 'header',
            path: 'If-Match',
            code: header === undefined ? 'invalid_type' : 'invalid_format',
            message: 'Expected one strong task version ETag.',
          },
        ],
      },
    });
  }
  return [version];
}
