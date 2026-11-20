import { eventSchemas } from '@cadenway/contracts/events/task-service';
import type { DatabaseSchema, TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { describe, expect, it, vi } from 'vitest';
import { OutboxCommentEvents } from './outbox-comment-events.adapter.js';

describe('comment outbox', () => {
  it('appends a contract-valid text-free event with the eligible watcher audience', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const events = new OutboxCommentEvents(
      {
        kind: 'tenant',
        organizationId: '019A5F3C-8D2E-7C4A-9B1F-3E5D7A9C1B2F',
      } as TransactionScope<DatabaseSchema>,
      { append } as unknown as OutboxWriter,
    );
    await events.created({
      organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f',
      actorUserId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
      taskKey: 'CAD-482',
      taskVersion: 2,
      spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
      listId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
      commentId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
      commentVersion: 1,
      watcherIds: ['019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30'],
    });
    expect(append).toHaveBeenCalledOnce();
    const payload: unknown = append.mock.calls[0]?.[3];
    expect(payload).toMatchObject({
      mentionedUserIds: [],
      watcherIds: ['019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30'],
    });
    expect(payload).not.toHaveProperty('body');
    expect(
      eventSchemas['comment.created.v1'].safeParse({
        ...(payload as object),
        id: '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d40',
        occurredAt: '2026-11-08T10:40:00Z',
      }).success,
    ).toBe(true);
  });
  it.each(['updated', 'deleted'] as const)(
    'appends a contract-valid text-free %s fact',
    async (kind) => {
      const append = vi.fn().mockResolvedValue(undefined);
      const organizationId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';
      const events = new OutboxCommentEvents(
        { kind: 'tenant', organizationId } as TransactionScope<DatabaseSchema>,
        { append } as unknown as OutboxWriter,
      );
      await events[kind]({
        organizationId,
        actorUserId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
        taskKey: 'CAD-482',
        taskVersion: 3,
        spaceId: '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01',
        listId: '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12',
        commentId: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
        commentVersion: 2,
      });
      const payload: unknown = append.mock.calls[0]?.[3];
      expect(append.mock.calls[0]?.[2]).toBe(`comment.${kind}.v1`);
      expect(payload).not.toHaveProperty('body');
      expect(
        eventSchemas[`comment.${kind}.v1`].safeParse({
          ...(payload as object),
          id: '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d40',
          occurredAt: '2026-11-08T10:40:00Z',
        }).success,
      ).toBe(true);
    },
  );
});
