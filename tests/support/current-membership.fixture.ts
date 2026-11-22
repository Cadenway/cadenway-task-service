import { runWithOrganizationContext } from '@cadenway/nest-common';
import type { INestApplication } from '@nestjs/common';
import { vi } from 'vitest';

import { FindOrganizationMember } from '../../src/modules/organization-members/public/membership/find-organization-member.js';
import { ReadCurrentMembership } from '../../src/modules/organization-members/public/membership/read-current-membership.js';

/** Supplies matching authority for suites that provision Task without an Organization server. */
export function mirrorCurrentMembership(app: INestApplication): void {
  const projection = app.get(FindOrganizationMember);
  vi.spyOn(app.get(ReadCurrentMembership), 'execute').mockImplementation((organizationId, userId) =>
    runWithOrganizationContext(
      { organizationId, actor: { type: 'user', id: userId }, role: null, scopes: [] },
      () => projection.stamp({ organizationId, userId, unique: true }),
    ),
  );
}
