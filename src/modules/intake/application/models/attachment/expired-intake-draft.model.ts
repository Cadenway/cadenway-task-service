/** Tenant-bound identity of one expired applicant draft. */
export interface ExpiredIntakeDraft {
  // #region Properties
  /** Identifiers chosen by the system scan and verified again in the tenant transaction. */
  readonly organizationId: string;

  /** Immutable publication ID. */
  readonly publicationId: string;

  /** SHA-256 digest of the draft credential. */
  readonly draftDigest: string;
  // #endregion
}
