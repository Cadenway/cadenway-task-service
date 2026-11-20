import type { CommentTrashedTaskDetails } from './comment-trashed-task-details.model.js';

/** A task locked and versioned for a comment write, or a refusal. */
export type CommentWriteTask =
  | {
      readonly outcome: 'ready';
      readonly taskId: string;
      readonly spaceId: string;
      readonly listId: string;
      readonly version: number;
      readonly instant: Date;
      readonly unavailableRecipientIds?: readonly string[];
      readonly watcherIds: readonly string[];
      readonly replyRecipientId?: string;
    }
  | { readonly outcome: 'task-trashed'; readonly details: CommentTrashedTaskDetails }
  | { readonly outcome: 'task-not-found' | 'organization-not-found' | 'task-archived' }
  | { readonly outcome: 'role-insufficient'; readonly role: 'view' | 'comment' | 'edit' };
