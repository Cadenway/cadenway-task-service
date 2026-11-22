import type { MembershipStamp } from '../../../../models/membership/membership-stamp.model.js';

/** Checks membership at Organization before opening the transaction that uses it. */
export class ReadCurrentMembership {
  // #region Constructor
  /** Binds the source that owns membership. */
  public constructor(
    private readonly find: (
      organizationId: string,
      userId: string,
    ) => Promise<MembershipStamp | null>,
  ) {}
  // #endregion

  // #region Methods
  /** Resolves a proof bound to the given tenant and account. */
  public execute(organizationId: string, userId: string): Promise<MembershipStamp | null> {
    return this.find(organizationId, userId);
  }
  // #endregion
}
