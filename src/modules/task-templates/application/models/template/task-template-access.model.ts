/** The roles and audience seen through the space owner's permission policy. */
export type TaskTemplateAccess =
  | { readonly outcome: 'organization-not-found' }
  | { readonly outcome: 'space-not-found' }
  | {
      readonly outcome: 'found';
      readonly spaceRole: 'edit' | 'comment' | 'view';
      readonly listRole: 'edit' | 'comment' | 'view' | null;
      readonly sourceRestricted: boolean;
    };
