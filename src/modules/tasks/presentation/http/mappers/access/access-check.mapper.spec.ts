import { CheckTaskAccessInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import { toAccessCheck } from './access-check.mapper.js';

describe('toAccessCheck', () => {
  it.each(['edit', 'comment', 'view'] as const)(
    'answers the role %s, task id and placement in a body the contract validates',
    (role) => {
      const body = toAccessCheck({
        role,
        spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
        listId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
        taskId: '019a7002-3c4d-7e5f-9a6b-7c8d9e0f1234',
        taskKey: 'CAD-482',
      });

      expect(CheckTaskAccessInternalResponse.parse(body)).toEqual(body);
      expect(body).toEqual({
        role,
        spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
        listId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
        taskId: '019a7002-3c4d-7e5f-9a6b-7c8d9e0f1234',
        taskKey: 'CAD-482',
      });
    },
  );
});
