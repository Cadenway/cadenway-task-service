import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

const MEMBERSHIP_CHECK = Symbol('current-membership-check');

/** Requires a current membership for the privileged mutation. */
@Injectable()
export class CurrentMembershipGuard implements CanActivate {
  // #region Properties
  /** Injection token for the current membership check. */
  public static readonly binding = MEMBERSHIP_CHECK;
  // #endregion

  // #region Constructor
  /** Binds the check that runs before the transaction. */
  public constructor(
    @Inject(MEMBERSHIP_CHECK)
    private readonly check: (context: ExecutionContext) => Promise<boolean>,
  ) {}
  // #endregion

  // #region Methods
  /** Verifies membership for the current request. */
  public canActivate(context: ExecutionContext): Promise<boolean> {
    return this.check(context);
  }
  // #endregion
}
