import { getOrganizationContext, ProblemException } from '@cadenway/nest-common';

import type { TaskTemplateCaller } from '../../../../application/models/template/task-template-caller.model.js';

const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Builds a library caller from the verified internal token and validated path. */
export function toTaskTemplateCaller(spaceId: string): TaskTemplateCaller {
  const context = getOrganizationContext();
  if (context?.actor.type !== 'user' || context.actor.id === null || !UUID.test(context.actor.id)) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (context.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  return {
    organizationId: context.organizationId.toLowerCase(),
    actorUserId: context.actor.id.toLowerCase(),
    spaceId: spaceId.toLowerCase(),
  };
}
