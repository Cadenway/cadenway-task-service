/** Viewer and validated task keys from the internal visibility request. */
export interface GetTaskVisibilityInput {
  // #region Properties
  /** Organization of the verified request context. */
  readonly organizationId: string;

  /** Account of the verified actor. */
  readonly actorUserId: string;

  /** Distinct canonical task keys, with at most 100 entries. */
  readonly taskKeys: readonly string[];
  // #endregion
}
