import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { FactoryProvider } from '@nestjs/common';

import { FindOrganizationMember } from '../../../../../organization-members/public/membership/find-organization-member.js';
import { ResolveGoalSpaces } from '../../../../../spaces/public/goal/resolve-goal-spaces.js';
import { FindVisibleLists } from '../../../../../spaces/public/list/find-visible-lists.js';
import { FindFavoriteSpaces } from '../../../../../spaces/public/space/find-favorite-spaces.js';
import type { SearchAccessPlacement } from '../../../../application/models/search-access/search-access-placement.model.js';
import type { SearchAccessViewer } from '../../../../application/models/search-access/search-access-viewer.model.js';
import type { SearchProjectionReader } from '../../../../application/ports/outbound/persistence/search-projection/search-projection-reader.port.js';
import type { SearchProjection } from '../../../../application/projections/search-projection/search-projection.projection.js';
import { ResolveTaskSearchAccess } from '../../../../application/use-cases/queries/search-access/resolve-task-search-access/resolve-task-search-access.use-case.js';
import { DrizzleSearchProjectionReader } from '../../../../infrastructure/persistence/drizzle/repositories/search-projection/drizzle-search-projection-reader.repository.js';

function placementOf(projection: SearchProjection): SearchAccessPlacement {
  const { id, version } = projection;
  switch (projection.kind) {
    case 'task':
      return {
        kind: 'task',
        id,
        version,
        listId: projection.listId,
        spaceId: projection.spaceId,
      };
    case 'list':
      return { kind: 'list', id, version, spaceId: projection.spaceId };
    case 'space':
      return { kind: 'space', id, version };
  }
}

function spaceViewer(viewer: SearchAccessViewer) {
  return {
    organizationId: viewer.organizationId,
    viewerUserId: viewer.actorUserId,
    viewerRole: viewer.role,
  };
}

/** Runs the applied membership, active placement and canonical grants in a shared read snapshot. */
export const resolveTaskSearchAccessProvider: FactoryProvider<ResolveTaskSearchAccess> = {
  provide: ResolveTaskSearchAccess,
  inject: [
    TenantTransactionRunner,
    FindOrganizationMember,
    DrizzleSearchProjectionReader,
    FindVisibleLists,
    FindFavoriteSpaces,
    ResolveGoalSpaces,
  ],
  useFactory: (
    runner: TenantTransactionRunner,
    members: FindOrganizationMember,
    projections: SearchProjectionReader,
    lists: FindVisibleLists,
    spaces: FindFavoriteSpaces,
    direct: ResolveGoalSpaces,
  ): ResolveTaskSearchAccess =>
    new ResolveTaskSearchAccess({
      read: (work) =>
        runner.run(
          () =>
            work({
              membership: ({ organizationId, actorUserId }) =>
                members.stamp({ organizationId, userId: actorUserId }),
              placements: async (organizationId, kind, ids) =>
                (await projections.resolve(organizationId, kind, ids)).flatMap(({ projection }) =>
                  projection === null ? [] : [placementOf(projection)],
                ),
              visibleLists: async (viewer, listIds) =>
                (await lists.execute({ ...spaceViewer(viewer), listIds })).lists.map(
                  ({ id }) => id,
                ),
              visibleSpaces: async (viewer, spaceIds) =>
                (await spaces.execute({ ...spaceViewer(viewer), spaceIds })).map(({ id }) => id),
              directSpaces: async (viewer, spaceIds) =>
                (await direct.execute({ ...spaceViewer(viewer), spaceIds })).map(({ id }) => id),
            }),
          { readOnly: true, isolationLevel: 'repeatable read' },
        ),
    }),
};
