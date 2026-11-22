import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

const MEMBERSHIP_CHECK = Symbol('access-request-current-membership');

/** Requires a current membership before resolving requests for managed resources. */
@Injectable()
export class CurrentMembershipGuard implements CanActivate {
  // #region Properties
  /** Injection token for the current membership check. */
  public static readonly binding = MEMBERSHIP_CHECK;
  // #endregion

  // #region Constructor
  /** Runs the check before opening a transaction. */
  public constructor(
    @Inject(MEMBERSHIP_CHECK)
    private readonly check: (context: ExecutionContext) => Promise<boolean>,
  ) {}
  // #endregion

  // #region Methods
  /** Reads the current membership for this request. */
  public canActivate(context: ExecutionContext): Promise<boolean> {
    return this.check(context);
  }
  // #endregion
}
