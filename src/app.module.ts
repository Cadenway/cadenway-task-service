import {
  CONFIG,
  ConfigModule,
  HealthModule,
  postgresIndicator,
  runWithOrganizationContext,
} from '@cadenway/nest-common';
import type { PostgresProbe } from '@cadenway/nest-common';
import { DATABASE_POOL, DatabaseModule } from '@cadenway/nest-common/database';
import type { DatabaseConfig } from '@cadenway/nest-common/database';
import { JobsRuntimeModule } from '@cadenway/nest-jobs/runtime';
import {
  MessagingConnection,
  MessagingModule,
  messagingHealthIndicator,
} from '@cadenway/nest-messaging';
import { OutboxModule } from '@cadenway/nest-messaging/outbox';
import { Module } from '@nestjs/common';

import { appConfigSchema } from './config/app-config.js';
import type { AppConfig } from './config/app-config.js';
import { jobQueues } from './config/job-queues.js';
import { AccessRequestsModule } from './modules/access-requests/access-requests.module.js';
import { DeletionLifecycleModule } from './modules/deletion-lifecycle/deletion-lifecycle.module.js';
import { FavoritesModule } from './modules/favorites/favorites.module.js';
import { IntakeModule } from './modules/intake/intake.module.js';
import { GoalsModule } from './modules/goals/goals.module.js';
import {
  MemberLifecycleModule,
  MembershipRebuildModule,
} from './modules/member-lifecycle/member-lifecycle.module.js';
import { OrganizationMembersModule } from './modules/organization-members/organization-members.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { SavedViewsModule } from './modules/saved-views/saved-views.module.js';
import { SpacesModule } from './modules/spaces/spaces.module.js';
import { TaskTemplatesModule } from './modules/task-templates/task-templates.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { TaskCommentsModule } from './modules/task-comments/task-comments.module.js';
import { NotificationVisibilityModule } from './modules/notification-visibility/notification-visibility.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { TaskApprovalsModule } from './modules/task-approvals/task-approvals.module.js';

/**
 * Function runJobInOrganization
 *
 * @description
 * Runs the handler of a job in the organization context of the transaction that enqueued it, as
 * the kit of messaging does for an event: the tenant transaction runner of the handler reads that
 * organization, and row-level security limits it to it. The organization is lower-cased: the kit
 * stores it as the enqueuing transaction spelled it (the raw envelope of a member event, which the
 * contract accepts in either case), while the payloads of the events a job appends carry the ids
 * PostgreSQL returns, in lower case, and the outbox writer of the kit compares the two strictly.
 * The actor is the system: a job acts for nobody. A job without organization (a scheduled one)
 * runs without context, so a tenant transaction it would open is refused.
 *
 * @param {string | null} organizationId - Organization of the job.
 * @param {() => Promise<void>} work - The handler call.
 * @returns {Promise<void>} Settles with the handler.
 */
function runJobInOrganization(
  organizationId: string | null,
  work: () => Promise<void>,
): Promise<void> {
  if (organizationId === null) {
    return work();
  }
  return runWithOrganizationContext(
    {
      organizationId: organizationId.toLowerCase(),
      actor: { type: 'system', id: null },
      role: null,
      scopes: [],
    },
    work,
  );
}

/**
 * Class AppModule
 *
 * @description
 * Root module of the service. `createApplication` of `@cadenway/nest-common` wraps it with the
 * logs, the `application/problem+json` errors, the validation pipe, the internal token guard and
 * the other shared formats; this module declares what the service itself depends on. Importing it
 * reads no configuration: every module below is built when the application is created.
 *
 * - `ConfigModule` (`eager: false`): the environment is validated against `appConfigSchema` when
 *   the application is created and provided as `CONFIG`; an invalid one makes `createApplication`
 *   reject with the `ConfigError`, which `runApplication` writes as one line.
 * - `DatabaseModule`: the pool of this service's own database, opened as the application role of
 *   `DATABASE_URL`, the tenant and system transaction runners, and the `Idempotency-Key`
 *   interceptor for the routes marked `@Idempotent()`. The pool closes on shutdown.
 * - `MessagingModule`: the NATS connection of the `task` user, with the inbox prefix `_INBOX.task`
 *   the broker requires. The creation waits for the first connection, then checks that the
 *   `EVENTS` stream exists: cadenway-ops creates the streams (`manageStreams: false`), and only
 *   notification-service runs the dead-letter worker. The service publishes the `space.*` and
 *   `list.*` events of `SpacesModule` and the `task.*` events of `TasksModule` through the outbox,
 *   and consumes the member events of organization-service (`MemberLifecycleModule`).
 * - `OutboxModule`: the outbox writer, the PostgreSQL deduplicator and the relay, which polls
 *   `outbox_events` every second in a system transaction and publishes the pending rows. It runs in
 *   every replica; `for update skip locked` keeps two of them from publishing the same row.
 * - `HealthModule`: `GET /health/live` answers as soon as the process runs; `GET /health/ready`
 *   answers 503 while PostgreSQL or NATS does not answer within 1 second, and from the start of a
 *   shutdown. Both routes are exempt from the internal token, every other route requires it.
 *   `shutdownDelayMs` is 0: nothing that routes to this internal service reads its readiness.
 *   Callers reach it through the Docker DNS of the `internal` network, which keeps returning a
 *   stopping container until it exits, whatever its health (checked on Docker 28.2), and the GitOps
 *   agent only waits for the new container to be healthy before it stops the old one. A delay would
 *   lengthen every stop, under the 10 second default grace period of Docker, without moving any
 *   request away; set it above the probe interval of a proxy if one ever routes on readiness.
 * - `JobsRuntimeModule`: the durable jobs of `@cadenway/nest-jobs`, on pg-boss in the `pgboss`
 *   schema of this service's own database, as the application role of `DATABASE_URL`, with a pool
 *   of two connections of its own (the producer enqueues through the transaction of the use case).
 *   Every replica is producer, worker and scheduler: the scheduler supervises expired attempts and
 *   watches the dead-letter queues. Each handler runs in the organization context of its job,
 *   lower-cased (`runJobInOrganization`). `src/migrate.ts` provisions the schema and the queues of
 *   `src/config/job-queues.ts` as the migrator role; the start-up fails with
 *   `JobsNotProvisionedError` while they are missing. Running jobs get 8 seconds to finish at
 *   shutdown (`shutdownTimeoutMs`), under the 10 second default grace period of Docker, since the
 *   deploy definition may not set `stop_grace_period`: a batch of the clean-up job takes about a
 *   second and the handler starts no batch once its signal aborts, so it stops at a batch boundary;
 *   an attempt still running after that is failed and retried. The queues are the clean-up of a
 *   removed member (`MemberLifecycleModule`), four of the deletions and the trash
 *   (`DeletionLifecycleModule`), and intake receipt cleanup (`IntakeModule`). Every replica
 *   registers durable system schedules, including the daily trash schedule at 03:00 UTC and
 *   the minutely receipt cleanup schedules.
 * - `PlatformModule`: owns the kit tables in the service's migrations and schedules HTTP receipt
 *   retention.
 * - `OrganizationMembersModule`: the copy of the memberships of organization-service, the source of
 *   the members and roles of the service.
 * - `SpacesModule`: the spaces, their statuses and prefixes, and their lists and sprints, with the
 *   internal routes of `/internal/v1/spaces` and `/internal/v1/lists`.
 * - `TasksModule`: the tasks, their subtasks, assignees, labels and checklist, the activity log of
 *   a task and of a list, and the task queries, with the internal routes of
 *   `/internal/v1/tasks`, the task, activity, group and counter routes of
 *   `/internal/v1/lists/{listId}`, the overview of `/internal/v1/spaces/{spaceId}`, the labels of
 *   `/internal/v1/labels` and "Mes tâches" and "Accueil" of `/internal/v1/users/{userId}`. It
 *   reads the members from `OrganizationMembersModule` and the lists, spaces and task keys from
 *   `SpacesModule`.
 * - `AccessRequestsModule`: the requests for access to spaces, lists and tasks, with the internal
 *   routes of `/internal/v1/access-requests`. It reads the members from
 *   `OrganizationMembersModule`, the targets and the grants from `SpacesModule` and the tasks from
 *   `TasksModule`; neither depends on it.
 * - `MemberLifecycleModule`: the three durable consumers (`task-service__project-member-*`) of
 *   `member.joined.v1`, `member.role-changed.v1` and `member.removed.v1`, which the deduplicator of
 *   `OutboxModule` runs in the tenant transaction of each event. Each event updates the copy of
 *   `OrganizationMembersModule`; a removal then enqueues the `task.clean-up-removed-member` job in
 *   the same transaction, whose worker, in this module, hands the private spaces of the former
 *   member over to the owner and removes their grants through `SpacesModule`, drops their pending
 *   access requests through `AccessRequestsModule`, then unassigns them from their tasks through
 *   `TasksModule`, batch after batch.
 * - `DeletionLifecycleModule`: the workers of the deletions and of the trash. The deletion of a
 *   list or a space (`SpacesModule`) enqueues `task.trash-deleted-tasks`, whose worker moves the
 *   tasks of each deleted list to the trash through `TasksModule`, batch after batch, dropping
 *   through `AccessRequestsModule` the pending requests of the space, of each list and of the tasks
 *   it moves in transactions that read them still deleted, and erases a deleted space left without
 *   a list through `SpacesModule`; "Supprimer la tâche" (`TasksModule`) enqueues
 *   `task.drop-trashed-task-requests` for the requests of the tasks of its entry still in the
 *   trash; "Vider la corbeille" (`TasksModule`) and the daily `task.schedule-trash-purge`, whose
 *   enqueue is a system transaction that inserts job rows only, enqueue `task.purge-trash`, whose
 *   worker erases the entries handed over or due, then the tombstones left without a task, batch
 *   after batch. None of these modules depends on it.
 *
 * Business modules under `src/modules/` are registered here as they are created.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ schema: appConfigSchema, eager: false }),
    // Response authorization in these modules wraps the Kit idempotency interceptor.
    TasksModule,
    SpacesModule,
    TaskTemplatesModule,
    SavedViewsModule,
    FavoritesModule,
    DatabaseModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        connectionString: config.DATABASE_URL,
        applicationName: 'task-service',
        transactionMaxAttempts: config.DATABASE_TRANSACTION_MAX_ATTEMPTS,
        idempotency: true,
      }),
    }),
    MessagingModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        service: 'task-service',
        servers: config.NATS_URL,
        user: config.NATS_USER,
        password: config.NATS_PASSWORD,
        manageStreams: false,
        deadLetterWorker: false,
      }),
    }),
    OutboxModule.forRoot(),
    JobsRuntimeModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        connection: { connectionString: config.DATABASE_URL },
        queues: jobQueues,
        capabilities: ['producer', 'worker', 'scheduler'],
        poolSize: 2,
        shutdownTimeoutMs: 8_000,
        runInOrganization: runJobInOrganization,
      }),
    }),
    HealthModule.forRootAsync({
      inject: [DATABASE_POOL, MessagingConnection],
      useFactory: (pool: PostgresProbe, connection: MessagingConnection) => ({
        indicators: [postgresIndicator(pool), messagingHealthIndicator(connection)],
        shutdownDelayMs: 0,
      }),
    }),
    PlatformModule,
    OrganizationMembersModule,
    TaskCommentsModule,
    NotificationVisibilityModule,
    OnboardingModule,
    TaskApprovalsModule,
    AccessRequestsModule,
    MemberLifecycleModule,
    DeletionLifecycleModule,
    IntakeModule,
    GoalsModule,
  ],
})
export class AppModule {}

/** Opens the offline Task membership rebuild against the validated restore candidate. */
export function rebuildTaskMemberships(
  config: Readonly<DatabaseConfig>,
  spool: string,
): Promise<number> {
  return MembershipRebuildModule.rebuild(config, spool);
}
