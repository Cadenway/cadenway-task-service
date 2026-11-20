/** The owner, intended library space and requested source key of a template. */
export interface TaskTemplateSourceInput {
  // #region Properties
  /** Tenant of the request. */
  readonly organizationId: string;

  /** Actor whose edit permission is checked. */
  readonly actorUserId: string;

  /** Space that must contain the source. */
  readonly spaceId: string;

  /** Key of the source task. */
  readonly taskKey: string;
  // #endregion
}
