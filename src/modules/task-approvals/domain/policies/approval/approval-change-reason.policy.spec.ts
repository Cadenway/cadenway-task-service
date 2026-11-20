import { describe, expect, it } from 'vitest';

import { validateApprovalChangeReason } from './approval-change-reason.policy.js';

describe('validateApprovalChangeReason', () => {
  it('counts Unicode code points and accepts the exact limit', () => {
    expect(() => {
      validateApprovalChangeReason('🗂'.repeat(5000));
    }).not.toThrow();
  });

  it.each(['', ' \n\t', 'un\0fichier', '🗂'.repeat(5001)])(
    'refuses an invalid change reason',
    (reason) => {
      expect(() => {
        validateApprovalChangeReason(reason);
      }).toThrow(expect.objectContaining({ reason: 'invalid-reason' }));
    },
  );
});
