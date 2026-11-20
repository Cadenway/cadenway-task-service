import { RequestTaskApprovalInternalHeader } from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException } from '@cadenway/nest-common';

/** Requires the single strong task ETag specified for approval writes. */
export function approvalExpectedVersion(header: string | undefined): readonly number[] {
  const result = RequestTaskApprovalInternalHeader.safeParse({ 'If-Match': header });
  if (!result.success) {
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
  const version = Number(result.data['If-Match'].slice(1, -1));
  // An unrepresentable version cannot match a stored task version.
  return Number.isSafeInteger(version) ? [version] : [];
}
