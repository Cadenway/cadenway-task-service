/** Physically removed targets of one kind in the current tenant. */
export interface PurgeTargetFavoritesInput {
  // #region Properties
  /** Tenant whose target owner is purging resources. */
  readonly organizationId: string;

  /** Resource kind being removed. */
  readonly kind: 'space' | 'list' | 'saved-view';

  /** Identities the caller holds for permanent removal. */
  readonly targetIds: readonly string[];
  // #endregion
}
