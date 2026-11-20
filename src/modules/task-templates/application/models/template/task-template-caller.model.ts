/** Verified caller and the space whose template library they address. */
export interface TaskTemplateCaller {
  // #region Properties
  /** Verified tenant. */
  readonly organizationId: string;

  /** Verified user actor. */
  readonly actorUserId: string;

  /** Owner of the addressed library. */
  readonly spaceId: string;
  // #endregion
}
