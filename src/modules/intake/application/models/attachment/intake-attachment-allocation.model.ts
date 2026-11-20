/** The tenant scope returned to the trusted gateway for a single eligible reservation. */
export interface IntakeAttachmentAllocation {
  // #region Properties
  /** Tenant resolved from the published form. */
  readonly organizationId: string;

  /** Stable identity of that publication. */
  readonly publicationId: string;

  /** Stable identity allocated to the upload. */
  readonly attachmentId: string;

  /** Exclusive draft deadline. */
  readonly expiresAt: Date;
  // #endregion
}
