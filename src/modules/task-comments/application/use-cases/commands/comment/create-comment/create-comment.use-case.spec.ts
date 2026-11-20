import { describe, expect, it, vi } from 'vitest';
import { Comment } from '../../../../../domain/aggregates/comment/comment.aggregate.js';
import type { CommentWriteStore } from '../../../../models/comment/comment-write-store.model.js';
import type { CommentTaskWriter } from '../../../../ports/outbound/tasks/task/comment-task-writer.port.js';
import type { CommentUnitOfWork } from '../../../../ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import { CreateComment } from './create-comment.use-case.js';

/** New comment of CAD-482. */
const comment = Comment.restore({
  id: 'comment',
  organizationId: 'org',
  taskId: 'task',
  actorType: 'user',
  actorId: 'camille',
  body: 'Bonjour',
  mentions: [],
  replyToCommentId: null,
  createdAt: new Date('2026-11-08T10:40:00Z'),
  editedAt: null,
  deletedAt: null,
  version: 1,
});
/** Caller and submitted body. */
const input = {
  organizationId: 'org',
  actorUserId: 'camille',
  taskKey: 'CAD-482',
  body: 'Bonjour',
  replyToCommentId: null,
};
/** Locked task after the version change. */
const ready = {
  outcome: 'ready',
  taskId: 'task',
  spaceId: 'space',
  listId: 'list',
  version: 2,
  instant: new Date('2026-11-08T10:40:00Z'),
} as const;

describe('create comment', () => {
  it('records the comment, activity and text-free outbox fact after task authorization', async () => {
    const insert = vi.fn().mockResolvedValue(comment);
    const created = vi.fn().mockResolvedValue(undefined);
    const store: CommentWriteStore = {
      comments: { insert, find: vi.fn(), list: vi.fn(), count: vi.fn(), update: vi.fn() },
      events: { created, updated: vi.fn(), deleted: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: vi.fn(), write: async (work) => work(store) };
    const begin = vi.fn().mockResolvedValue(ready);
    const record = vi.fn().mockResolvedValue(undefined);
    const tasks: CommentTaskWriter = { begin, record, change: vi.fn(), canRead: vi.fn() };
    expect(await new CreateComment(unit, tasks).execute(input)).toBe(comment);
    expect(begin).toHaveBeenCalledWith(input, []);
    expect(record).toHaveBeenCalledWith(input, 2, 'comment', 'Bonjour');
    expect(created).toHaveBeenCalledWith({
      organizationId: 'org',
      actorUserId: 'camille',
      taskKey: 'CAD-482',
      taskVersion: 2,
      spaceId: 'space',
      listId: 'list',
      commentId: 'comment',
      commentVersion: 1,
      mentionedUserIds: [],
    });
  });

  it('refuses an insufficient role before inspecting a reply', async () => {
    const find = vi.fn();
    const insert = vi.fn();
    const store: CommentWriteStore = {
      comments: { insert, find, list: vi.fn(), count: vi.fn(), update: vi.fn() },
      events: { created: vi.fn(), updated: vi.fn(), deleted: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: vi.fn(), write: async (work) => work(store) };
    const tasks: CommentTaskWriter = {
      begin: () => Promise.resolve({ outcome: 'role-insufficient', role: 'view' }),
      record: vi.fn(),
      change: vi.fn(),
      canRead: vi.fn(),
    };
    await expect(
      new CreateComment(unit, tasks).execute({ ...input, replyToCommentId: 'hidden' }),
    ).rejects.toMatchObject({ reason: 'role-insufficient' });
    expect(find).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a missing or deleted reply without inserting or emitting', async () => {
    const insert = vi.fn();
    const created = vi.fn();
    const store: CommentWriteStore = {
      comments: {
        insert,
        find: vi.fn().mockResolvedValue(null),
        list: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      events: { created, updated: vi.fn(), deleted: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: vi.fn(), write: async (work) => work(store) };
    const tasks: CommentTaskWriter = {
      begin: () => Promise.resolve(ready),
      record: vi.fn(),
      change: vi.fn(),
      canRead: vi.fn(),
    };
    await expect(
      new CreateComment(unit, tasks).execute({ ...input, replyToCommentId: 'missing' }),
    ).rejects.toMatchObject({ reason: 'comment-not-found' });
    expect(insert).not.toHaveBeenCalled();
    expect(created).not.toHaveBeenCalled();
  });
  it('includes a reply recipient only when its human author can still read the task', async () => {
    const created = vi.fn().mockResolvedValue(undefined);
    const store: CommentWriteStore = {
      comments: {
        insert: vi.fn().mockResolvedValue(comment),
        find: vi.fn().mockResolvedValue(comment),
        list: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      events: { created, updated: vi.fn(), deleted: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: vi.fn(), write: async (work) => work(store) };
    const tasks: CommentTaskWriter = {
      begin: () => Promise.resolve(ready),
      record: vi.fn().mockResolvedValue(undefined),
      change: vi.fn(),
      canRead: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    };
    const useCase = new CreateComment(unit, tasks);
    await useCase.execute({ ...input, replyToCommentId: 'comment' });
    await useCase.execute({ ...input, replyToCommentId: 'comment' });
    expect(created.mock.calls[0]?.[0]).toMatchObject({
      reply: { commentId: 'comment', userId: 'camille' },
    });
    expect(created.mock.calls[1]?.[0]).not.toHaveProperty('reply');
  });
  it('checks distinct eligible recipients and emits their ids without comment text', async () => {
    const created = vi.fn();
    const insert = vi.fn().mockResolvedValue(comment);
    const canRead = vi.fn().mockResolvedValue(true);
    const store: CommentWriteStore = {
      comments: { insert, find: vi.fn(), list: vi.fn(), count: vi.fn(), update: vi.fn() },
      events: { created, updated: vi.fn(), deleted: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: vi.fn(), write: async (work) => work(store) };
    const tasks: CommentTaskWriter = {
      begin: vi.fn().mockResolvedValue(ready),
      record: vi.fn(),
      change: vi.fn(),
      canRead,
    };
    await new CreateComment(unit, tasks).execute({
      ...input,
      body: '@Cam @Cam',
      mentions: [
        { userId: 'camille', start: 0, end: 4 },
        { userId: 'camille', start: 5, end: 9 },
      ],
    });
    expect(canRead).toHaveBeenCalledTimes(1);
    expect(created).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedUserIds: ['camille'] }),
    );
  });
  it('refuses an ineligible recipient after the task role check', async () => {
    const insert = vi.fn();
    const canRead = vi.fn().mockResolvedValue(false);
    const store: CommentWriteStore = {
      comments: { insert, find: vi.fn(), list: vi.fn(), count: vi.fn(), update: vi.fn() },
      events: { created: vi.fn(), updated: vi.fn(), deleted: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: vi.fn(), write: async (work) => work(store) };
    const tasks: CommentTaskWriter = {
      begin: vi.fn().mockResolvedValue(ready),
      record: vi.fn(),
      change: vi.fn(),
      canRead,
    };
    await expect(
      new CreateComment(unit, tasks).execute({
        ...input,
        body: '@Ada',
        mentions: [{ userId: 'ada', start: 0, end: 4 }],
      }),
    ).rejects.toMatchObject({ reason: 'recipient-invalid' });
    expect(insert).not.toHaveBeenCalled();
  });
});
