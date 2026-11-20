import type { CommentTrashedTaskDetails } from './comment-trashed-task-details.model.js';

/** A task visibility result, with no identity for an invisible task. */
export type CommentTaskResult =
  | { readonly outcome: 'found'; readonly taskId: string }
  | { readonly outcome: 'task-trashed'; readonly details: CommentTrashedTaskDetails }
  | { readonly outcome: 'task-not-found' | 'organization-not-found' };
