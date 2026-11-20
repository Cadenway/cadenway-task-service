import type { TaskTrashedDetails } from '../../../../models/trash/task-trashed-details.model.js';

/** Task state for a comment creation, or a non-disclosing refusal. */
export type BeginCommentOutput =
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
  | { readonly outcome: 'task-trashed'; readonly details: TaskTrashedDetails }
  | { readonly outcome: 'task-not-found' | 'organization-not-found' | 'task-archived' }
  | { readonly outcome: 'role-insufficient'; readonly role: 'view' | 'comment' | 'edit' };
