import { ProblemException, ProblemFilter } from '@cadenway/nest-common';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitTaskActionFilter } from './git-task-action.filter.js';

describe('GitTaskActionFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    new ProblemException({ status: 409, code: 'idempotency.request-in-progress' }),
    new ProblemException({ status: 422, code: 'idempotency.key-reused' }),
    new ProblemException({ status: 404, code: 'task.not-found' }),
    new BadRequestException(),
  ])('preserves the typed HTTP refusal', (exception) => {
    const delegate = vi.spyOn(ProblemFilter.prototype, 'catch').mockImplementation(() => undefined);
    const host = {} as ArgumentsHost;
    new GitTaskActionFilter().catch(exception, host);
    expect(delegate).toHaveBeenCalledWith(exception, host);
  });

  it.each([new Error('private database details'), new InternalServerErrorException()])(
    'sanitizes an unexpected failure anywhere in the route pipeline',
    (exception) => {
      const delegate = vi
        .spyOn(ProblemFilter.prototype, 'catch')
        .mockImplementation(() => undefined);
      const host = {} as ArgumentsHost;
      new GitTaskActionFilter().catch(exception, host);
      const received: unknown = delegate.mock.calls[0]?.[0];
      expect(received).toMatchObject({ problem: { status: 503, code: 'task.action-unavailable' } });
      expect(delegate.mock.calls[0]?.[1]).toBe(host);
    },
  );
});
