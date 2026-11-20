import { describe, expect, it } from 'vitest';
import { InvalidCommentError } from '../../errors/comment/invalid-comment.error.js';
import { Comment } from './comment.aggregate.js';

/** A live reply that retains its identity after deletion. */
const reply = Comment.restore({
  id: 'comment',
  organizationId: 'organization',
  taskId: 'task',
  actorType: 'user',
  actorId: 'author',
  body: 'Original',
  mentions: [],
  replyToCommentId: 'parent',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  editedAt: null,
  deletedAt: null,
  version: 1,
});

describe('comment changes', () => {
  it('versions an edit and keeps the creation and reply identity', () => {
    const at = new Date('2026-01-02T00:00:00Z');
    const edited = reply.edit('Edited 🐈', at);
    expect(edited.snapshot).toMatchObject({
      id: 'comment',
      body: 'Edited 🐈',
      replyToCommentId: 'parent',
      createdAt: reply.snapshot.createdAt,
      editedAt: at,
      deletedAt: null,
      version: 2,
    });
    expect(reply.snapshot.body).toBe('Original');
  });

  it('erases the body and retains the reply identity in a versioned tombstone', () => {
    const at = new Date('2026-01-03T00:00:00Z');
    const deleted = reply.delete(at);
    expect(deleted.snapshot).toMatchObject({
      id: 'comment',
      body: null,
      replyToCommentId: 'parent',
      deletedAt: at,
      version: 2,
    });
    expect(() => deleted.edit('Again', at)).toThrow(InvalidCommentError);
    expect(() => deleted.delete(at)).toThrow(InvalidCommentError);
  });

  it('rejects invalid edits without changing the original', () => {
    expect(() => reply.edit('   ', new Date())).toThrow(InvalidCommentError);
    expect(() => reply.edit('x'.repeat(5001), new Date())).toThrow(InvalidCommentError);
    expect(reply.snapshot.version).toBe(1);
  });
});
