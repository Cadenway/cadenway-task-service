import { getOrganizationContext, ProblemException } from '@cadenway/nest-common';
import type { OrganizationContext } from '@cadenway/nest-common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';

/**
 * Constant UUID
 *
 * @description
 * A UUID in its canonical text form, in either case.
 *
 * @type {RegExp}
 */
const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Function toCaller
 *
 * @description
 * Reads the organization and the user from the verified internal token, never from the path, the
 * query or the body. The guard has already refused any other actor and a token without an
 * organization, so a missing one here is a defect of the wiring, answered like the guard would. The
 * ids are lower-cased, the form PostgreSQL returns and the use cases compare with: an account id
 * that is not a UUID is refused like an actor the route does not accept.
 *
 * @returns {Caller} The organization and the user.
 * @throws {ProblemException} `403 auth.actor-not-allowed` without a user actor, or with an account
 * id that is not a UUID; `403 auth.organization-required` without an organization.
 */
export function toCaller(): Caller {
  const context: OrganizationContext | undefined = getOrganizationContext();
  if (context?.actor.type !== 'user' || context.actor.id === null || !UUID.test(context.actor.id)) {
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
