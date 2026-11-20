/** Verified Storage fact identifiers, under its already verified organization context. */
export interface VerifyIntakeAttachmentInput {
  // #region Properties
  /** Tenant from the validated event envelope. */
  readonly organizationId: string;

  /** Publication that owns the reservation. */
  readonly publicationId: string;

  /** Storage's verified reservation ID. */
  readonly attachmentId: string;
  // #endregion
}
