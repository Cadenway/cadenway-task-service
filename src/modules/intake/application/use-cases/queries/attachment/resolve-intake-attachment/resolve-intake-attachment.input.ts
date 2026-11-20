/** The private draft and reservation to authorize for Storage completion. */
export interface ResolveIntakeAttachmentInput {
  // #region Properties
  /** Opaque key of the current publication. */
  readonly publicKey: string;

  /** Applicant draft credential. */
  readonly draftKey: string;

  /** Reservation identity from the signed upload allocation. */
  readonly attachmentId: string;
  // #endregion
}
