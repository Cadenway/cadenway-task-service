import { ProblemException } from '@cadenway/nest-common';
import type { ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { ListDuplicateController } from '../../controllers/duplicate/list-duplicate.controller.js';
import { TaskDuplicateController } from '../../controllers/duplicate/task-duplicate.controller.js';
import { RequiredDuplicateBodyGuard } from './required-duplicate-body.guard.js';

function context(didRead: boolean): ExecutionContext {
  const request = {
    headers: {},
    is: () => 'application/json',
    readableDidRead: didRead,
  } as unknown as Request;
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('the duplication body guard', () => {
  it('accepts a streamed body and refuses an empty stream before interception', () => {
    const guard = new RequiredDuplicateBodyGuard();
    expect(guard.canActivate(context(true))).toBe(true);
    expect(() => guard.canActivate(context(false))).toThrow(ProblemException);
  });

  it.each([TaskDuplicateController, ListDuplicateController])(
    'guards the duplicate route',
    (controller) => {
      const method = Object.getOwnPropertyDescriptor(controller.prototype, 'duplicate')
        ?.value as object;
      const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, method);
      expect(guards).toContain(RequiredDuplicateBodyGuard);
    },
  );
});
