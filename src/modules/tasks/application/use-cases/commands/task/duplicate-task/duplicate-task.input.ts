/** The actor, task key and accepted source versions of a standalone copy. */
export interface DuplicateTaskInput {
  // #region Properties
  /** The verified tenant. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly taskKey: string;
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
