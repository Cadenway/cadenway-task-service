import { VoteOnTaskApprovalInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import type { z } from 'zod';

/** A reviewer's decision and, for a change request, its comment. */
export const approvalVoteBodySchema = VoteOnTaskApprovalInternalBody.superRefine(
  (body, context) => {
    if (
      body.decision === 'changes-requested' &&
      (body.reason.includes('\u0000') ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(body.reason))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Expected storable Unicode text without the character U+0000',
      });
    }
  },
);

/** Parsed decision supplied to the vote operation. */
export type ApprovalVoteBody = z.output<typeof approvalVoteBodySchema>;
