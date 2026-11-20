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
    }
  | { readonly outcome: 'task-not-found' | 'organization-not-found' | 'task-archived' }
  | { readonly outcome: 'role-insufficient'; readonly role: 'view' | 'comment' | 'edit' };
