import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { approvalExpectedVersion } from './approval-version.mapper.js';

describe('approvalExpectedVersion', () => {
  it('accepts one strong task version', () => {
    expect(approvalExpectedVersion('"13"')).toEqual([13]);
  });

  it.each([undefined, '', '*', '13', 'W/"13"', '"13", "14"', '"0"', '"9007199254740992"'])(
    'rejects a missing or invalid approval precondition %s',
    (header) => {
      expect(() => approvalExpectedVersion(header)).toThrow(ProblemException);
      try {
        approvalExpectedVersion(header);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ProblemException);
        if (error instanceof ProblemException) {
          expect(error.problem).toMatchObject({ status: 400, code: 'request.invalid' });
        }
      }
    },
  );
});
