import { principalOf, ProblemException } from '@cadenway/nest-common';
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';

/** Applies the projection contract's exact system identity to the principal verified by the kit. */
@Injectable()
export class TaskSearchProjectionActorGuard implements CanActivate {
  // #region Methods
  /** Refuses another subject even when its actor type is system. */
  public canActivate(context: ExecutionContext): boolean {
    const principal = principalOf(context.switchToHttp().getRequest<object>());
    if (principal?.actor.type !== 'system' || principal.actor.id !== 'search-service') {
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    }
    return true;
  }
  // #endregion
}
