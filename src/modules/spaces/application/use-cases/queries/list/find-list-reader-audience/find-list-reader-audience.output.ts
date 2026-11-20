/** A list's access rules before checking whether an account is a current member. */
export interface FindListReaderAudienceOutput {
  // #region Properties
  /** Whether organization access reaches all non-guest members. */
  readonly allNonGuests: boolean;

  /** Non-guests with access through the space owner or an explicit grant. */
  readonly nonGuestIds: readonly string[];

  /** Guests with a grant on the list itself. */
  readonly guestIds: readonly string[];
  // #endregion
}
