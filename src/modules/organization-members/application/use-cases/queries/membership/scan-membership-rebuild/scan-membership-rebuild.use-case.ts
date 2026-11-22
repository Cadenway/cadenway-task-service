import type { MembershipRebuildRow } from '../../../../projections/membership/membership-rebuild-row.projection.js';

/** Scans the restored Task membership projection for an offline restore preflight. */
export class ScanMembershipRebuild {
  // #region Constructor
  /** Binds the paged reader of the restored projection. */
  public constructor(
    private readonly read: (
      check: (rows: AsyncIterable<MembershipRebuildRow>) => Promise<void>,
    ) => Promise<void>,
  ) {}
  // #endregion

  // #region Methods
  /** Checks every stored generation using a bounded reader. */
  public execute(
    check: (rows: AsyncIterable<MembershipRebuildRow>) => Promise<void>,
  ): Promise<void> {
    return this.read(check);
  }
  // #endregion
}
