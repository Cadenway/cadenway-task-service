/** Reads membership and direct space roles from the same tenant snapshot. */
export interface DocumentSpaceAccessStore {
  // #region Methods
  /** Finds the actor's current role in the organization. */
  findViewer(input: {
    readonly organizationId: string;
    readonly userId: string;
  }): Promise<{ readonly role: 'owner' | 'admin' | 'member' | 'guest' } | null>;

  /** Resolves only the requested spaces through the canonical direct-space policy. */
  resolveSpaces(input: {
    readonly organizationId: string;
    readonly viewerUserId: string;
    readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';
    readonly spaceIds: readonly string[];
  }): Promise<readonly { readonly id: string; readonly role: 'view' | 'comment' | 'edit' }[]>;
  // #endregion
}
