import { getOrganizationContext, principalOf, ProblemException } from '@cadenway/nest-common';
import type { InternalActor } from '@cadenway/nest-common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

interface MembershipStamp {
  // #region Properties
  /** Membership generation. */
  readonly memberId: string;

  /** Version at which the role was evaluated. */
  readonly version: number;

  /** Role returned by the authority. */
  readonly role: string;
  // #endregion
}

interface CurrentMembership {
  // #region Properties
  /** Tenant for which the proof was obtained. */
  readonly organizationId: string;

  /** Proof returned by the authority. */
  readonly stamp: MembershipStamp;
  // #endregion
}

// The verifier creates an actor object per request. The Kit's context preserves that identity.
const checked = new WeakMap<InternalActor, CurrentMembership>();

/** Reads the authority before replay guards and interceptors open their transactions. */
export function currentMembershipCheck(memberships: {
  execute(organizationId: string, userId: string): Promise<MembershipStamp | null>;
}): (context: ExecutionContext) => Promise<boolean> {
  return async (context) => {
    const principal = principalOf(context.switchToHttp().getRequest<Request>());
    if (principal?.actor.type !== 'user' || principal.actor.id === null) {
      throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
    }
    if (principal.organizationId === null) {
      throw new ProblemException({ status: 403, code: 'auth.organization-required' });
    }
    const organizationId = principal.organizationId.toLowerCase();
    const stamp = await memberships
      .execute(organizationId, principal.actor.id.toLowerCase())
      .catch(() => {
        // Document consumes the dedicated problem of its protected access-check operation.
        throw new ProblemException({
          status: 503,
          code:
            principal.issuer === 'document-service'
              ? 'task.document-space-access-unavailable'
              : 'http.service-unavailable',
        });
      });
    if (stamp === null) {
      throw new ProblemException({ status: 404, code: 'organization.not-found' });
    }
    checked.set(principal.actor, { organizationId, stamp });
    return true;
  };
}

/** Compares the acting user's projection inside the transaction that relies on it. */
export function matchesCurrentMembership(
  organizationId: string,
  userId: string,
  projected: MembershipStamp | null,
): boolean {
  const actor = getOrganizationContext()?.actor;
  const proof = actor === undefined ? undefined : checked.get(actor);
  if (proof === undefined || actor?.id?.toLowerCase() !== userId) return true;
  return (
    proof.organizationId === organizationId &&
    projected?.memberId === proof.stamp.memberId &&
    projected.role === proof.stamp.role &&
    projected.version === proof.stamp.version
  );
}
