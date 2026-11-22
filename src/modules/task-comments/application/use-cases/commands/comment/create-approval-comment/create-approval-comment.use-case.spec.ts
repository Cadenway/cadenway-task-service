import { describe, expect, it, vi } from 'vitest';

import { Comment } from '../../../../../domain/aggregates/comment/comment.aggregate.js';
import type { CommentWriteStore } from '../../../../models/comment/comment-write-store.model.js';
import type { CommentTaskWriter } from '../../../../ports/outbound/tasks/task/comment-task-writer.port.js';
import type { CommentUnitOfWork } from '../../../../ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import { CreateApprovalComment } from './create-approval-comment.use-case.js';

const input = {
  organizationId: 'org',
  taskId: 'task',
  taskKey: 'CAD-482',
  taskVersion: 3,
  spaceId: 'space',
  listId: 'list',
  watcherIds: ['hugo'],
  commentId: 'comment',
  actorUserId: 'camille',
  body: 'Please revise this.',
};

describe('CreateApprovalComment', () => {
  it('records the reserved comment, activity and event in the joined transaction', async () => {
    const comment = Comment.restore({
      id: input.commentId,
      organizationId: input.organizationId,
      taskId: input.taskId,
      actorType: 'user',
      actorId: input.actorUserId,
      body: input.body,
      mentions: [],
      replyToCommentId: null,
      createdAt: new Date('2026-11-20T10:00:00.000Z'),
      editedAt: null,
      deletedAt: null,
      version: 1,
    });
    const insert = vi.fn().mockResolvedValue(comment);
    const created = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn().mockResolvedValue(undefined);
    const store: CommentWriteStore = {
      comments: { insert, find: vi.fn(), list: vi.fn(), count: vi.fn(), update: vi.fn() },
      events: { created, updated: vi.fn(), deleted: vi.fn() },
    };
    const unit: CommentUnitOfWork = { read: vi.fn(), write: async (work) => work(store) };
    const begin = vi.fn();
    const tasks: CommentTaskWriter = {
      authorizeUser: vi.fn(),
      authorizeAutomation: vi.fn(),
      begin,
      record,
      change: vi.fn(),
      canRead: vi.fn(),
    };

    await new CreateApprovalComment(unit, tasks).execute(input);

    expect(begin).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith({
      id: 'comment',
      organizationId: 'org',
      taskId: 'task',
      actorType: 'user',
      actorId: 'camille',
      body: input.body,
      mentions: [],
      replyToCommentId: null,
    });
    expect(record).toHaveBeenCalledWith(input, 3, 'comment', input.body);
    expect(created).toHaveBeenCalledWith({
      organizationId: 'org',
      actor: { type: 'user', id: 'camille' },
      taskKey: 'CAD-482',
      taskVersion: 3,
      spaceId: 'space',
      listId: 'list',
      commentId: 'comment',
      commentVersion: 1,
      mentionedUserIds: [],
      watcherIds: ['hugo'],
    });
  });

  it('rejects an invalid reason before writing any comment', async () => {
    const write = vi.fn();
    const unit: CommentUnitOfWork = { read: vi.fn(), write };
    const tasks: CommentTaskWriter = {
      authorizeUser: vi.fn(),
      authorizeAutomation: vi.fn(),
      begin: vi.fn(),
      record: vi.fn(),
      change: vi.fn(),
      canRead: vi.fn(),
    };

    await expect(
      new CreateApprovalComment(unit, tasks).execute({ ...input, body: '  ' }),
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
});
