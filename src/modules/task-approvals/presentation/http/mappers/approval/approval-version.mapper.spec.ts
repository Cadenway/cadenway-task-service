import { ProblemException } from '@cadenway/nest-common';
import { describe, expect, it } from 'vitest';

import { approvalExpectedVersion } from './approval-version.mapper.js';

describe('approvalExpectedVersion', () => {
  it('accepts one strong task version', () => {
    expect(approvalExpectedVersion('"13"')).toEqual([13]);
    expect(approvalExpectedVersion('"9007199254740991"')).toEqual([9007199254740991]);
  });

  it.each(['"9007199254740992"', '"9007199254740993"', `"${'9'.repeat(400)}"`])(
    'keeps an unrepresentable strong ETag as an unsatisfied condition %s',
    (header) => {
      expect(approvalExpectedVersion(header)).toEqual([]);
    },
  );

  it.each([undefined, '', '*', '13', 'W/"13"', '"13", "14"', '"0"'])(
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
