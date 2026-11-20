import { describe, expect, it } from 'vitest';

import { approvalVoteBodySchema } from './approval-vote-body.dto.js';

describe('approvalVoteBodySchema', () => {
  it('accepts both published decisions', () => {
    expect(approvalVoteBodySchema.safeParse({ decision: 'approved' }).success).toBe(true);
    expect(
      approvalVoteBodySchema.safeParse({ decision: 'changes-requested', reason: 'Review this.' })
        .success,
    ).toBe(true);
  });

  it('rejects missing, extra or unstorable reason text', () => {
    expect(approvalVoteBodySchema.safeParse({ decision: 'changes-requested' }).success).toBe(false);
    expect(
      approvalVoteBodySchema.safeParse({ decision: 'approved', reason: 'extra' }).success,
    ).toBe(false);
    expect(
      approvalVoteBodySchema.safeParse({ decision: 'changes-requested', reason: 'a\u0000b' })
        .success,
    ).toBe(false);
  });
});
