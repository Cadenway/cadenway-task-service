/** Ownership of a draft as specified by the P4 public intake attachment operations. */
export interface IntakeAttachmentDraftBinding {
  // #region Properties
  /** Organization of the resolved publication. */
  readonly organizationId: string;

  /** Immutable publication issuing this draft, replaced when the form is republished. */
  readonly publicationId: string;

  /** SHA-256 digest of the applicant's opaque draft key. */
  readonly draftDigest: string;
  // #endregion
}
