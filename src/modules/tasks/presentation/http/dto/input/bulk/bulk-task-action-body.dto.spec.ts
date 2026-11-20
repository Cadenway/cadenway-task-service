import { describe, expect, it } from 'vitest';

import { BulkTaskActionBody } from './bulk-task-action-body.dto.js';

describe('the atomic bulk action body', () => {
  it('accepts every published action and preserves selection versions', () => {
    for (const action of [
      { type: 'status', status: 'done' },
      { type: 'priority', priority: 'haute' },
      { type: 'assign', userId: '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f01' },
      { type: 'unassign', userId: '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f01' },
      { type: 'move', listId: '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f02' },
      { type: 'trash' },
      { type: 'duplicate' },
    ]) {
      const body = { selection: [{ taskKey: 'CAD-482', version: 12 }], action };
      expect(BulkTaskActionBody.schema.parse(body)).toEqual(body);
    }
  });

  it('refuses duplicates, absent bodies, unknown members and more than 50 keys', () => {
    const action = { type: 'trash' };
    expect(BulkTaskActionBody.schema.safeParse({}).success).toBe(false);
    expect(
      BulkTaskActionBody.schema.safeParse({
        selection: [{ taskKey: 'CAD-482' }, { taskKey: 'CAD-482', version: 12 }],
        action,
      }).success,
    ).toBe(false);
    expect(
      BulkTaskActionBody.schema.safeParse({
        selection: Array.from({ length: 51 }, (_, index) => ({
          taskKey: `CAD-${String(index + 1)}`,
        })),
        action,
      }).success,
    ).toBe(false);
    expect(
      BulkTaskActionBody.schema.safeParse({
        selection: [{ taskKey: 'CAD-482' }],
        action: { ...action, priority: 'haute' },
      }).success,
    ).toBe(false);
  });

  it('rejects text that PostgreSQL cannot store without echoing it', () => {
    const parsed = BulkTaskActionBody.schema.safeParse({
      selection: [{ taskKey: 'CAD-482' }],
      action: { type: 'status', status: 'cancelled', cancelReason: 'scope', cancelNote: '\u0000' },
    });
    expect(parsed.success).toBe(false);
  });
});
