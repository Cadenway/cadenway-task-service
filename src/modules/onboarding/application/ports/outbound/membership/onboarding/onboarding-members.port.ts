/** Resolves the current local membership, holding it during writes. */
export interface OnboardingMembers {
  // #region Methods
  /** Runs the requested operation. */
  find(
    organizationId: string,
    userId: string,
    lock: boolean,
  ): Promise<{
    readonly role: 'owner' | 'admin' | 'member' | 'guest';
  } | null>;
  // #endregion
}
