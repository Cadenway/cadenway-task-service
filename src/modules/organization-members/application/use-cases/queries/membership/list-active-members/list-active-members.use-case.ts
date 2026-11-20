import type { MembershipsUnitOfWork } from '../../../../ports/outbound/transactions/membership/memberships-unit-of-work.port.js';
import type { ListActiveMembersInput } from './list-active-members.input.js';
import type { ListActiveMembersOutput } from './list-active-members.output.js';

/** Pages current memberships for the caller's access audience without exposing names and profiles. */
export class ListActiveMembers {
  // #region Properties
  /** Tenant transaction joined to the caller. */
  private readonly unit: MembershipsUnitOfWork;
  // #endregion

  // #region Constructor
  /** Binds the organization members read. */
  public constructor(unit: MembershipsUnitOfWork) {
    this.unit = unit;
  }
  // #endregion

  // #region Methods
  /** Lists each eligible account once, using its least privileged active membership. */
  public async execute(input: ListActiveMembersInput): Promise<readonly ListActiveMembersOutput[]> {
    return this.unit.run((memberships) => memberships.listActivePage(input));
  }
  // #endregion
}
