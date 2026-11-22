/**
 * Interface FindOrganizationMemberInput
 *
 * @description
 * Which account in which organization. `organizationId` is the organization of the caller's
 * verified context, the one its tenant transaction runs for: row-level security hides every other
 * organization, so another value finds nothing.
 */
export interface FindOrganizationMemberInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the verified context.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property userId
   *
   * @description
   * The account, usually the actor of the internal token or a member it names.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property lock
   *
   * @description
   * `true` to keep the memberships read locked (`FOR SHARE`) until the end of the transaction
   * of the caller: a concurrent removal or role change of the account then waits for the write of
   * the caller to commit, and sees what it wrote. Write use cases pass `true`; absent, `false`.
   *
   * @type {boolean | undefined}
   * @readonly
   */
  readonly lock?: boolean;

  /** Require exactly one active membership when binding an authorization grant. */
  readonly unique?: boolean;
  // #endregion
}
