/** Tenant keyset page of current accounts in the audience supplied by the caller. */
export interface ListActiveMembersInput {
  // #region Properties
  /** The organization from the caller's verified context. */
  readonly organizationId: string;

  /** Accounts must follow this user ID, if supplied. */
  readonly after: string | null;

  /** The maximum number of rows, including any look-ahead row. */
  readonly limit: number;

  /** Whether any current non-guest membership is eligible. */
  readonly allNonGuests: boolean;

  /** Explicit non-guest accounts eligible for the page. */
  readonly nonGuestIds: readonly string[];

  /** Explicit guest accounts eligible for the page. */
  readonly guestIds: readonly string[];
  // #endregion
}
