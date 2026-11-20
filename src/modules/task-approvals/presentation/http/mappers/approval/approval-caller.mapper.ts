import { getOrganizationContext, ProblemException } from '@cadenway/nest-common';

/** Reads the caller from the verified internal token. */
export function approvalCaller(): { organizationId: string; actorUserId: string } {
  const context = getOrganizationContext();
  if (
    context?.actor.type !== 'user' ||
    context.actor.id === null ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(context.actor.id)
  ) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (context.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  return {
    organizationId: context.organizationId.toLowerCase(),
    actorUserId: context.actor.id.toLowerCase(),
  };
}
