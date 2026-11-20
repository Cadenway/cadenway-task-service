import type { TaskTrashedDetails } from '../../../../models/trash/task-trashed-details.model.js';

/** Visibility result for a comment read; an invisible task never exposes its ID. */
export type ResolveCommentTaskOutput =
  | { readonly outcome: 'found'; readonly taskId: string }
  | { readonly outcome: 'task-trashed'; readonly details: TaskTrashedDetails }
  | { readonly outcome: 'task-not-found' }
  | { readonly outcome: 'organization-not-found' };
