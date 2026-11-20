import type { TaskTrashedDetails } from '../../../../models/trash/task-trashed-details.model.js';

/** Only an authorized editor can obtain the stable task ID. */
export type ResolveIntakeContactTaskOutput =
  | { readonly outcome: 'found'; readonly taskId: string }
  | { readonly outcome: 'task-trashed'; readonly details: TaskTrashedDetails }
  | { readonly outcome: 'task-not-found' }
  | { readonly outcome: 'organization-not-found' }
  | { readonly outcome: 'role-insufficient'; readonly role: 'view' | 'comment' };
