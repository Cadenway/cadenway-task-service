/** Live library access and the source list's audience within that library. */
export type TaskTemplateScope =
  | { readonly outcome: 'organization-not-found' }
  | { readonly outcome: 'space-not-found' }
  | {
      readonly outcome: 'found';
      readonly spaceRole: 'edit' | 'comment' | 'view';
      readonly listRole: 'edit' | 'comment' | 'view' | null;
      readonly sourceRestricted: boolean;
    };
