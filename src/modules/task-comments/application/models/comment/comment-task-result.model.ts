/** A task visibility result, with no identity for an invisible task. */
export type CommentTaskResult =
  | { readonly outcome: 'found'; readonly taskId: string }
  | { readonly outcome: 'task-not-found' | 'organization-not-found' };
