/** A verified member and target space, optionally held for a definition mutation. */
export interface CustomFieldSpaceInput {
  // #region Properties
  /** State used by this operation. */
  readonly organizationId: string;
  readonly spaceId: string;
  readonly viewerUserId: string;
  readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';
  readonly lock: boolean;
  // #endregion
}
