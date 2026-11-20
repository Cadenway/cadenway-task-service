import { describe, expect, it, vi } from 'vitest';
import type { CommentStore } from '../../../../models/comment/comment-store.model.js';
import { CommentReadRefusal } from '../../../../models/comment/comment-read-refusal.model.js';
import type { CommentTaskDirectory } from '../../../../ports/outbound/tasks/task/comment-task-directory.port.js';
import type { CommentUnitOfWork } from '../../../../ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import { Comment } from '../../../../../domain/aggregates/comment/comment.aggregate.js';
import { GetComment } from '../get-comment/get-comment.use-case.js';
import { ListComments } from './list-comments.use-case.js';

/** A stored live comment of CAD-482. */
const comment = Comment.restore({
  organizationId: 'org',
  taskId: 'task',
  id: 'comment',
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
/** The verified caller and task. */
const caller = { organizationId: 'org', actorUserId: 'camille', taskKey: 'CAD-482' };

describe('comment reads', () => {
  it('checks task visibility before looking up a comment', async () => {
    const find = vi.fn();
    const store: CommentStore = {
      comments: { find, insert: vi.fn(), list: vi.fn(), count: vi.fn(), update: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: async (work) => work(store), write: vi.fn() };
    const tasks: CommentTaskDirectory = {
      resolve: () => Promise.resolve({ outcome: 'task-not-found' }),
    };
    await expect(
      new GetComment(unit, tasks).execute({ ...caller, commentId: 'comment' }),
    ).rejects.toMatchObject({ reason: 'task-not-found' });
    expect(find).not.toHaveBeenCalled();
  });

  it('returns a live comment and refuses a missing or deleted one', async () => {
    const find = vi.fn().mockResolvedValueOnce(comment).mockResolvedValueOnce(null);
    const store: CommentStore = {
      comments: { find, insert: vi.fn(), list: vi.fn(), count: vi.fn(), update: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: async (work) => work(store), write: vi.fn() };
    const tasks: CommentTaskDirectory = {
      resolve: () => Promise.resolve({ outcome: 'found', taskId: 'task' }),
    };
    const useCase = new GetComment(unit, tasks);
    expect(await useCase.execute({ ...caller, commentId: 'comment' })).toBe(comment);
    await expect(useCase.execute({ ...caller, commentId: 'comment' })).rejects.toMatchObject({
      reason: 'comment-not-found',
    });
    expect(find).toHaveBeenCalledWith('org', 'task', 'comment', false);
  });

  it('bounds the page and returns the last item as the next position', async () => {
    const second = Comment.restore({ ...comment.snapshot, id: 'second' });
    const list = vi.fn().mockResolvedValue([comment, second]);
    const store: CommentStore = {
      comments: {
        find: vi.fn(),
        insert: vi.fn(),
        list,
        count: vi.fn().mockResolvedValue(2),
        update: vi.fn(),
      },
    };
    const unit: CommentUnitOfWork = { read: async (work) => work(store), write: vi.fn() };
    const tasks: CommentTaskDirectory = {
      resolve: () => Promise.resolve({ outcome: 'found', taskId: 'task' }),
    };
    const result = await new ListComments(unit, tasks).execute({
      ...caller,
      after: null,
      limit: 1,
    });
    expect(result).toEqual({
      items: [comment],
      total: 2,
      next: { id: 'comment', createdAt: comment.snapshot.createdAt },
    });
    expect(list).toHaveBeenCalledWith('org', 'task', null, 2);
  });

  it('propagates a missing organization without querying comments', async () => {
    const list = vi.fn();
    const store: CommentStore = {
      comments: { find: vi.fn(), insert: vi.fn(), list, count: vi.fn(), update: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: async (work) => work(store), write: vi.fn() };
    const tasks: CommentTaskDirectory = {
      resolve: () => Promise.resolve({ outcome: 'organization-not-found' }),
    };
    await expect(
      new ListComments(unit, tasks).execute({ ...caller, after: null, limit: 1 }),
    ).rejects.toBeInstanceOf(CommentReadRefusal);
    expect(list).not.toHaveBeenCalled();
  });
});
