import type { CommentState } from '../../../domain/value-objects/comment/comment-state.value-object.js';

/** A new comment; PostgreSQL assigns the ID, creation instant and initial version. */
export type CommentDraft = Pick<
  CommentState,
  'organizationId' | 'taskId' | 'actorType' | 'actorId' | 'replyToCommentId' | 'mentions'
> & { readonly body: string; readonly id?: string };
