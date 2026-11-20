/** Private draft reservation to release. */
export interface ReleaseIntakeAttachmentInput {
  // #region Properties
  /** Opaque key of the current publication. */
  readonly publicKey: string;

  /** Applicant draft credential. */
  readonly draftKey: string;

  /** Identity of the reservation. */
  readonly attachmentId: string;
  // #endregion
}
