import { ListListActivityInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { describe, expect, it } from 'vitest';

import type { ActivityEntryView } from '../../../../application/projections/activity/activity-entry-view.projection.js';
import { toActivityEntry } from './activity-entry.mapper.js';
import { toActivityPage } from './activity-page.mapper.js';

const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';
const HUGO = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/**
 * Builds an entry of CAD-482 in Sprint 14 recorded by Camille Martin.
 *
 * @param change - What the entry recorded.
 * @returns The entry.
 */
function entryOf(change: ActivityEntryView['change']): ActivityEntryView {
  return {
    id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b10',
    occurredAt: new Date('2026-11-18T10:15:30.123Z'),
    kind: change.kind,
    actor: { type: 'user', id: CAMILLE },
    task: { key: 'CAD-482', name: 'Ajouter la connexion par lien magique', status: 'progress' },
    listId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02',
    change,
  };
}

describe('toActivityEntry', () => {
  it('gives a creation no detail', () => {
    const entry = toActivityEntry(entryOf({ kind: 'create' }));

    expect(entry.kind).toBe('create');
    expect(entry.status).toBeUndefined();
    expect(entry.priority).toBeUndefined();
    expect(entry.dueDate).toBeUndefined();
    expect(entry.assignee).toBeUndefined();
  });

  it('gives each kind exactly the detail of the kind', () => {
    const entries = [
      toActivityEntry(entryOf({ kind: 'status', status: { from: 'todo', to: 'progress' } })),
      toActivityEntry(entryOf({ kind: 'priority', priority: { from: 'moyenne', to: 'haute' } })),
      toActivityEntry(entryOf({ kind: 'due', dueDate: { from: null, to: '2026-11-20' } })),
      toActivityEntry(entryOf({ kind: 'assign', assignee: { userId: HUGO, added: true } })),
    ];

    expect(
      entries.map((entry) => Object.keys(entry).filter((key) => key !== 'kind').length),
    ).toEqual([6, 6, 6, 6]);
    expect(entries[0]?.status).toEqual({ from: 'todo', to: 'progress' });
    expect(entries[1]?.priority).toEqual({ from: 'moyenne', to: 'haute' });
    expect(entries[2]?.dueDate).toEqual({ from: null, to: '2026-11-20' });
    expect(entries[3]?.assignee).toEqual({ userId: HUGO, added: true });
  });

  it('maps comment activity with its ID and excerpt', () => {
    const entry = toActivityEntry(
      entryOf({
        kind: 'comment',
        commentId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
        commentExcerpt: 'Bonjour',
      }),
    );
    expect(entry).toMatchObject({
      kind: 'comment',
      commentId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
      commentExcerpt: 'Bonjour',
    });
  });

  it('maps the actor, the task reference and the instant, and answers what the validator accepts', () => {
    const page = toActivityPage(
      {
        items: [
          entryOf({ kind: 'create' }),
          entryOf({ kind: 'status', status: { from: 'todo', to: 'progress' } }),
          entryOf({ kind: 'due', dueDate: { from: '2026-11-20', to: null } }),
          entryOf({ kind: 'assign', assignee: { userId: HUGO, added: false } }),
        ],
        next: null,
        total: 4,
      },
      null,
    );

    expect(() => ListListActivityInternalResponse.parse(page)).not.toThrow();
    expect(page.items[0]).toMatchObject({
      occurredAt: '2026-11-18T10:15:30.123Z',
      actor: { type: 'user', id: CAMILLE },
      task: { key: 'CAD-482', status: 'progress' },
    });
    expect(page.total).toBe(4);
    expect(page.nextCursor).toBeNull();
  });
});
