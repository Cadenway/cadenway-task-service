/** Visibility result for a comment read; an invisible task never exposes its ID. */
export type ResolveCommentTaskOutput =
  | { readonly outcome: 'found'; readonly taskId: string }
  | { readonly outcome: 'task-not-found' }
  | { readonly outcome: 'organization-not-found' };
