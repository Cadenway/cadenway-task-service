import { createReadStream } from 'node:fs';

import { ConfigModule, runWithOrganizationContext } from '@cadenway/nest-common';
import { DatabaseModule } from '@cadenway/nest-common/database';
import type { DatabaseConfig } from '@cadenway/nest-common/database';
import { JobsRuntimeModule } from '@cadenway/nest-jobs/runtime';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { jobQueues } from '../../config/job-queues.js';
import { AccessRequestsModule } from '../access-requests/access-requests.module.js';
import { FavoritesModule } from '../favorites/favorites.module.js';
import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { ScanMembershipRebuild } from '../organization-members/public/membership/scan-membership-rebuild.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { ApplyMemberEvent } from './application/use-cases/commands/membership/apply-member-event/apply-member-event.use-case.js';
import type { MembershipCopy } from './application/ports/outbound/members/membership/membership-copy.port.js';
import type { MemberEventUnitOfWork } from './application/ports/outbound/transactions/membership/member-event-unit-of-work.port.js';
import { RebuildMemberships } from './application/use-cases/commands/membership/rebuild-memberships/rebuild-memberships.use-case.js';
import { memberGrantsProvider } from './composition/providers/adapters/access/member-grants.provider.js';
import { memberAccessRequestsProvider } from './composition/providers/adapters/access-request/member-access-requests.provider.js';
import { taskAssignmentsProvider } from './composition/providers/adapters/assignee/task-assignments.provider.js';
import { cleanUpRemovedMemberHandlerProvider } from './composition/providers/adapters/clean-up/clean-up-removed-member-handler.provider.js';
import { memberFavoritesProvider } from './composition/providers/adapters/favorites/member-favorites.provider.js';
import { memberEventsHandlerProvider } from './composition/providers/adapters/membership/member-events-handler.provider.js';
import { memberEventsRedeliveryProvider } from './composition/providers/adapters/membership/member-events-redelivery.provider.js';
import { memberEventUnitOfWorkProvider } from './composition/providers/adapters/membership/member-event-unit-of-work.provider.js';
import { membershipCopyProvider } from './composition/providers/adapters/membership/membership-copy.provider.js';
import { privateSpaceHandoverProvider } from './composition/providers/adapters/space/private-space-handover.provider.js';
import { applyMemberEventProvider } from './composition/providers/use-cases/membership/apply-member-event.provider.js';
import { cleanUpRemovedMemberProvider } from './composition/providers/use-cases/membership/clean-up-removed-member.provider.js';
import { MEMBER_EVENT_UNIT_OF_WORK } from './composition/tokens/membership/member-event-unit-of-work.token.js';
import { MEMBERSHIP_COPY } from './composition/tokens/membership/membership-copy.token.js';
import { readMembershipSnapshot } from './infrastructure/adapters/membership-snapshot/read-membership-snapshot.js';

/**
 * Class MemberLifecycleModule
 *
 * @description
 * Composition root of what task-service does when the memberships of organization-service change:
 * the handler of `member.joined.v1`, `member.role-changed.v1` and `member.removed.v1` with their
 * redelivery schedule, the use case that applies each event to the copy of the memberships
 * (`ApplyMembershipChange` of `OrganizationMembersModule`) and, for a removal, enqueues the
 * `task.clean-up-removed-member` job in the same transaction, and the worker of that job
 * (`CleanUpRemovedMemberHandler`), which hands the private spaces of the former member over to the
 * owner (`HandOverPrivateSpaces` of `SpacesModule`), clears their favorites (`PurgeMemberFavorites`
 * of `FavoritesModule`), removes their grants (`RemoveMemberGrants` of
 * `SpacesModule`), drops their access requests (`DropMemberAccessRequests` of
 * `AccessRequestsModule`), then clears their task assignments and watcher overrides through
 * `TasksModule`, batch after batch. It orchestrates these modules so
 * that none calls another: `SpacesModule`, `TasksModule` and `AccessRequestsModule` already read the
 * copy, so the copy calling them would close a module cycle. It owns no table, no route and no
 * export.
 */
@Module({
  imports: [
    OrganizationMembersModule,
    SpacesModule,
    TasksModule,
    AccessRequestsModule,
    FavoritesModule,
  ],
  providers: [
    memberEventUnitOfWorkProvider,
    membershipCopyProvider,
    privateSpaceHandoverProvider,
    memberGrantsProvider,
    memberAccessRequestsProvider,
    memberFavoritesProvider,
    taskAssignmentsProvider,
    applyMemberEventProvider,
    cleanUpRemovedMemberProvider,
    cleanUpRemovedMemberHandlerProvider,
    memberEventsRedeliveryProvider,
    memberEventsHandlerProvider,
  ],
})
export class MemberLifecycleModule {}

/** Reconstitutes the membership lifecycle with a transactional job writer and no workers. */
@Module({
  imports: [OrganizationMembersModule],
  providers: [
    memberEventUnitOfWorkProvider,
    membershipCopyProvider,
    {
      provide: ApplyMemberEvent,
      inject: [MEMBER_EVENT_UNIT_OF_WORK, MEMBERSHIP_COPY],
      useFactory: (
        unitOfWork: MemberEventUnitOfWork,
        memberships: MembershipCopy,
      ): ApplyMemberEvent => new ApplyMemberEvent(unitOfWork, memberships, null),
    },
  ],
})
export class MembershipRebuildModule {
  // #region Methods
  /** Runs the preflight and applies the sealed spool to an offline candidate. */
  public static async rebuild(config: Readonly<DatabaseConfig>, spool: string): Promise<number> {
    const app = await NestFactory.createApplicationContext(
      {
        module: MembershipRebuildModule,
        imports: [
          ConfigModule.forValue({}),
          DatabaseModule.forRoot({
            connectionString: config.DATABASE_URL,
            applicationName: 'task-membership-rebuild',
            transactionMaxAttempts: config.DATABASE_TRANSACTION_MAX_ATTEMPTS,
          }),
          JobsRuntimeModule.forRoot({
            connection: { connectionString: config.DATABASE_URL },
            queues: jobQueues,
            capabilities: ['producer'],
            poolSize: 1,
          }),
        ],
      },
      { logger: false, abortOnError: false },
    );
    try {
      const projection = app.get(ScanMembershipRebuild);
      const apply = app.get(ApplyMemberEvent);
      const command = new RebuildMemberships(
        (verify) => projection.execute(verify),
        (event) =>
          runWithOrganizationContext(
            {
              organizationId: event.organizationId,
              actor: { type: 'system', id: 'task-service' },
              role: null,
              scopes: [],
            },
            async () => {
              await apply.execute(event);
            },
          ),
      );
      return await command.execute(() => readMembershipSnapshot(createReadStream(spool)));
    } finally {
      await app.close();
    }
  }
  // #endregion
}
