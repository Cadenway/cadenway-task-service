/** The fields compared with the authoritative Organization history during restore. */
export interface MembershipRebuildRow {
  // #region Properties
  /** Organization from the restored projection. */
  readonly organizationId: string;

  /** Membership generation from the restored projection. */
  readonly memberId: string;

  /** Account identity stored for this generation. */
  readonly userId: string;

  /** Role from the latest applied version. */
  readonly role: string;

  /** Latest applied version of this generation. */
  readonly version: number;

  /** Final removal time for terminal generations. */
  readonly removedAt: Date | null;
  // #endregion
}
