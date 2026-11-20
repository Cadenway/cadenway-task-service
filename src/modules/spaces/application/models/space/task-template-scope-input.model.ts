/** Library scope to read, or acquire in the lock order of a template write. */
export interface TaskTemplateScopeInput {
  // #region Properties
  /** Tenant of the verified request. */
  readonly organizationId: string;

  /** Actor whose projected membership is checked. */
  readonly actorUserId: string;

  /** Space owning the library. */
  readonly spaceId: string;

  /** Read or lock mode. */
  readonly mode: 'read' | 'prepare' | 'write';

  /** Source list to check during creation. */
  readonly listId?: string;
  // #endregion
}
