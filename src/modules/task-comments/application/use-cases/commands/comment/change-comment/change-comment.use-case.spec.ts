import { describe, expect, it, vi } from 'vitest';
import { Comment } from '../../../../../domain/aggregates/comment/comment.aggregate.js';
import type { CommentWriteStore } from '../../../../models/comment/comment-write-store.model.js';
import type { CommentTaskWriter } from '../../../../ports/outbound/tasks/task/comment-task-writer.port.js';
import type { CommentUnitOfWork } from '../../../../ports/outbound/transactions/comment/comment-unit-of-work.port.js';
import { ChangeComment } from './change-comment.use-case.js';

/** Existing comment. */
const comment = Comment.restore({
  id: 'comment',
  organizationId: 'org',
  taskId: 'task',
  actorType: 'user',
  actorId: 'author',
  body: 'Original',
  mentions: [],
  replyToCommentId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  editedAt: null,
  deletedAt: null,
  version: 1,
});
/** Authorized input. */
const input = {
  organizationId: 'org',
  actorUserId: 'author',
  taskKey: 'CAD-1',
  commentId: 'comment',
  expectedVersions: [1],
  body: 'Updated',
};
/** Creates transaction-bound doubles. */
function fixture() {
  const find = vi.fn().mockResolvedValue(comment);
  const update = vi.fn().mockResolvedValue(true);
  const updated = vi.fn();
  const deleted = vi.fn();
  const change = vi.fn();
  const canRead = vi.fn().mockResolvedValue(true);
  const store: CommentWriteStore = {
    comments: {
      find,
      update,
      insert: vi.fn(),
      list: vi.fn(),
      count: vi.fn(),
    },
    events: { created: vi.fn(), updated, deleted },
  };
  const begin = vi.fn().mockResolvedValue({
    outcome: 'ready',
    taskId: 'task',
    spaceId: 'space',
    listId: 'list',
    version: 4,
    instant: new Date('2026-01-02T00:00:00Z'),
  });
  const tasks: CommentTaskWriter = {
    begin,
    record: vi.fn(),
    change,
    canRead,
  };
  const unit: CommentUnitOfWork = { read: vi.fn(), write: async (work) => work(store) };
  return {
    begin,
    find,
    update,
    updated,
    deleted,
    change,
    canRead,
    useCase: new ChangeComment(unit, tasks),
  };
}

describe('change comment', () => {
  it('updates the body, activity and outbox at the new versions', async () => {
    const { update, updated, deleted, change, useCase } = fixture();
    const result = await useCase.execute(input);
    expect(result.snapshot).toMatchObject({ body: 'Updated', version: 2 });
    expect(update).toHaveBeenCalledWith(result, 1);
    expect(change).toHaveBeenCalledWith(input, 4, 'comment', 'Updated');
    expect(updated).toHaveBeenCalledWith(
      expect.objectContaining({ taskVersion: 4, commentVersion: 2 }),
    );
    expect(deleted).not.toHaveBeenCalled();
  });
  it('tombstones the comment and removes its activity', async () => {
    const { deleted, change, useCase } = fixture();
    const request = { ...input, body: null, expectedVersions: null };
    const result = await useCase.execute(request);
    expect(result.snapshot).toMatchObject({
      body: null,
      version: 2,
      deletedAt: new Date('2026-01-02T00:00:00Z'),
    });
    expect(change).toHaveBeenCalledWith(request, 4, 'comment', null);
    expect(deleted).toHaveBeenCalledWith(
      expect.objectContaining({ taskVersion: 4, commentVersion: 2 }),
    );
  });
  it('checks the role before comment existence or authorship', async () => {
    const { begin, find, useCase } = fixture();
    begin.mockResolvedValue({ outcome: 'role-insufficient', role: 'view' });
    await expect(useCase.execute(input)).rejects.toMatchObject({ reason: 'role-insufficient' });
    expect(find).not.toHaveBeenCalled();
  });
  it('checks authorship before the version and does not write', async () => {
    const { update, useCase } = fixture();
    await expect(
      useCase.execute({ ...input, actorUserId: 'other', expectedVersions: [9] }),
    ).rejects.toMatchObject({ reason: 'author-required' });
    expect(update).not.toHaveBeenCalled();
  });
  it('refuses a stale comment version without changing the comment', async () => {
    const { update, useCase } = fixture();
    await expect(useCase.execute({ ...input, expectedVersions: [9] })).rejects.toMatchObject({
      reason: 'version-mismatch',
      version: 1,
    });
    expect(update).not.toHaveBeenCalled();
  });
  it('validates recipients after authorship and emits unique changes for spans-only edits', async () => {
    const { find, canRead, updated, useCase } = fixture();
    const stored = Comment.restore({
      ...comment.snapshot,
      body: '@Ada @Ada @Bea',
      mentions: [
        { userId: 'ada', start: 0, end: 4 },
        { userId: 'ada', start: 5, end: 9 },
        { userId: 'bea', start: 10, end: 14 },
      ],
    });
    find.mockResolvedValue(stored);
    const mentions = [
      { userId: 'ada', start: 0, end: 4 },
      { userId: 'cy', start: 10, end: 14 },
    ];
    const result = await useCase.execute({ ...input, body: undefined, mentions });
    expect(result.snapshot.mentions).toEqual(mentions);
    expect(canRead).toHaveBeenCalledTimes(2);
    expect(updated).toHaveBeenCalledWith(
      expect.objectContaining({ addedMentionUserIds: ['cy'], removedMentionUserIds: ['bea'] }),
    );
  });
  it('rejects an ineligible mention without saving', async () => {
    const { canRead, update, useCase } = fixture();
    canRead.mockResolvedValue(false);
    await expect(
      useCase.execute({ ...input, body: '@Ada', mentions: [{ userId: 'ada', start: 0, end: 4 }] }),
    ).rejects.toMatchObject({ reason: 'recipient-invalid' });
    expect(update).not.toHaveBeenCalled();
  });
  it('clears spans when replacing body without replacements and on deletion', async () => {
    const { find, updated, useCase } = fixture();
    find.mockResolvedValue(
      Comment.restore({
        ...comment.snapshot,
        body: '@Ada',
        mentions: [{ userId: 'ada', start: 0, end: 4 }],
      }),
    );
    const result = await useCase.execute(input);
    expect(result.snapshot.mentions).toEqual([]);
    expect(updated).toHaveBeenCalledWith(
      expect.objectContaining({ removedMentionUserIds: ['ada'] }),
    );
    const deleted = await useCase.execute({ ...input, body: null });
    expect(deleted.snapshot.mentions).toEqual([]);
  });
});
