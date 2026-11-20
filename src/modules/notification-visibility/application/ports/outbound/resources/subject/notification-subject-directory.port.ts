/** Current membership and resource visibility in the caller's tenant snapshot. */
export interface NotificationSubjectDirectory {
  // #region Methods
  /** Resolves the current organization membership. */
  findMember(input: {
    readonly organizationId: string;
    readonly userId: string;
  }): Promise<{ readonly role: 'owner' | 'admin' | 'member' | 'guest' } | null>;

  /** Resolves visible tasks by exact identifiers. */
  findTasks(input: {
    readonly organizationId: string;
    readonly viewer: {
      readonly userId: string;
      readonly role: 'owner' | 'admin' | 'member' | 'guest';
    };
    readonly taskIds: readonly string[];
    readonly taskKeys: readonly string[];
  }): Promise<{
    readonly tasks: readonly {
      readonly id: string;
      readonly key: string;
      readonly name: string;
    }[];
  }>;

  /** Resolves readable lists. */
  findLists(input: {
    readonly organizationId: string;
    readonly viewerUserId: string;
    readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';
    readonly listIds: readonly string[];
  }): Promise<{ readonly lists: readonly { readonly id: string }[] }>;

  /** Resolves readable spaces. */
  findSpaces(input: {
    readonly organizationId: string;
    readonly viewerUserId: string;
    readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';
    readonly spaceIds: readonly string[];
  }): Promise<readonly { readonly id: string }[]>;

  /** Reads current live comments for already visible task bindings. */
  findComments(input: {
    readonly organizationId: string;
    readonly pairs: readonly { readonly taskId: string; readonly commentId: string }[];
  }): Promise<
    readonly { readonly taskId: string; readonly commentId: string; readonly excerpt: string }[]
  >;
  // #endregion
}
