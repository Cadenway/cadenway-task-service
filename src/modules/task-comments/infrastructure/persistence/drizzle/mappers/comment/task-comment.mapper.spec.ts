import { describe, expect, it } from 'vitest';

import { InvalidCommentError } from '../../../../../domain/errors/comment/invalid-comment.error.js';
import type { taskComments } from '../../schemas/comment/task-comment.schema.js';
import { toComment } from './task-comment.mapper.js';

/** A stored comment of CAD-482. */
const row: typeof taskComments.$inferSelect = {
  organizationId: 'atelier-nord',
  id: 'comment-1',
  taskId: 'cad-482',
  actorType: 'user',
  actorId: 'camille',
  body: 'Bonjour 😀',
  mentions: [],
  replyToCommentId: null,
  createdAt: new Date('2026-11-08T10:40:00Z'),
  editedAt: null,
  deletedAt: null,
  version: 1,
};

describe('comment row mapping', () => {
  it('preserves Markdown, authorship, timestamps and version', () => {
    expect(toComment(row).snapshot).toEqual(row);
  });

  it('preserves reply references in content-free tombstones', () => {
    const tombstone = {
      ...row,
      body: null,
      deletedAt: new Date('2026-11-08T11:00:00Z'),
      replyToCommentId: 'comment-2',
      version: 2,
    };
    expect(toComment(tombstone).snapshot).toEqual(tombstone);
  });

  it('rejects unknown authors and inconsistent tombstones', () => {
    expect(() => toComment({ ...row, actorType: 'unknown' })).toThrow(InvalidCommentError);
    expect(() => toComment({ ...row, body: null })).toThrow(InvalidCommentError);
    expect(() => toComment({ ...row, version: 0 })).toThrow(InvalidCommentError);
  });

  it('edits and tombstones at the next version and refuses further changes', () => {
    const edited = toComment(row).edit('Nouvelle note', new Date('2026-11-08T11:00:00Z'));
    const deleted = edited.delete(new Date('2026-11-08T12:00:00Z'));
    expect(edited.snapshot).toMatchObject({ body: 'Nouvelle note', version: 2 });
    expect(deleted.snapshot).toMatchObject({ body: null, version: 3 });
    expect(() => deleted.edit('Autre', new Date('2026-11-08T12:01:00Z'))).toThrow(
      InvalidCommentError,
    );
  });
  it('round-trips spans and forbids them on tombstones', () => {
    const mentioned = { ...row, body: '😀 @Ada', mentions: [{ userId: 'ada', start: 2, end: 6 }] };
    expect(toComment(mentioned).snapshot.mentions).toEqual(mentioned.mentions);
    expect(() => toComment({ ...mentioned, body: null, deletedAt: new Date() })).toThrow(
      InvalidCommentError,
    );
  });
});
