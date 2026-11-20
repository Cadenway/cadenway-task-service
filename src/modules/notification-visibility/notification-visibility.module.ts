import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { EventConsumers } from '@cadenway/nest-messaging';
import { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { FindOrganizationMember } from '../organization-members/public/membership/find-organization-member.js';
import { FindVisibleLists } from '../spaces/public/list/find-visible-lists.js';
import { FindFavoriteSpaces } from '../spaces/public/space/find-favorite-spaces.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { FindCommentExcerpts } from '../task-comments/public/comment/find-comment-excerpts.js';
import { TaskCommentsModule } from '../task-comments/task-comments.module.js';
import { FindVisibleTaskLocations } from '../tasks/public/task/find-visible-task-locations.js';
import { TasksModule } from '../tasks/tasks.module.js';
import type { NotificationSubjectDirectory } from './application/ports/outbound/resources/subject/notification-subject-directory.port.js';
import { DecideNotificationDeliveryAuthorization } from './application/use-cases/commands/delivery-authorization/decide-notification-delivery-authorization/decide-notification-delivery-authorization.use-case.js';
import { ResolveNotificationSubjects } from './application/use-cases/queries/subject/resolve-notification-subjects/resolve-notification-subjects.use-case.js';
import { OutboxNotificationDeliveryAuthorization } from './infrastructure/messaging/outbox/delivery-authorization/outbox-notification-delivery-authorization.adapter.js';
import { DrizzleNotificationDeliveryDecisionRepository } from './infrastructure/persistence/drizzle/repositories/decision/drizzle-notification-delivery-decision.repository.js';
import { NotificationSubjectsController } from './presentation/http/controllers/subject/notification-subjects.controller.js';
import { DecideNotificationDeliveryAuthorizationHandler } from './presentation/messaging/handlers/delivery-authorization/decide-notification-delivery-authorization.handler.js';

/** Supplies canonical access and display information through the owning modules. */
const NOTIFICATION_SUBJECT_DIRECTORY: symbol = Symbol('NOTIFICATION_SUBJECT_DIRECTORY');

/** Composes current resource visibility from the owning Task modules. */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, TasksModule, TaskCommentsModule],
  controllers: [NotificationSubjectsController],
  providers: [
    {
      provide: NOTIFICATION_SUBJECT_DIRECTORY,
      inject: [
        FindOrganizationMember,
        FindVisibleTaskLocations,
        FindVisibleLists,
        FindFavoriteSpaces,
        FindCommentExcerpts,
      ],
      useFactory: (
        memberships: FindOrganizationMember,
        tasks: FindVisibleTaskLocations,
        lists: FindVisibleLists,
        spaces: FindFavoriteSpaces,
        comments: FindCommentExcerpts,
      ): NotificationSubjectDirectory => ({
        findMember: (input) => memberships.execute(input),
        findTasks: (input) => tasks.execute(input),
        findLists: (input) => lists.execute(input),
        findSpaces: (input) => spaces.execute(input),
        findComments: (input) => comments.execute(input),
      }),
    },
    {
      provide: ResolveNotificationSubjects,
      inject: [TenantTransactionRunner, NOTIFICATION_SUBJECT_DIRECTORY],
      useFactory: (
        runner: TenantTransactionRunner,
        directory: NotificationSubjectDirectory,
      ): ResolveNotificationSubjects =>
        new ResolveNotificationSubjects(
          (work) => runner.run(work, { readOnly: true, isolationLevel: 'repeatable read' }),
          directory,
        ),
    },
    {
      provide: DecideNotificationDeliveryAuthorization,
      inject: [TenantTransactionRunner, OutboxWriter, NOTIFICATION_SUBJECT_DIRECTORY],
      useFactory: (
        runner: TenantTransactionRunner,
        outbox: OutboxWriter,
        directory: NotificationSubjectDirectory,
      ): DecideNotificationDeliveryAuthorization =>
        new DecideNotificationDeliveryAuthorization(
          (work) =>
            runner.run(
              (scope) => {
                const writer = new OutboxNotificationDeliveryAuthorization(scope, outbox);
                return work(new DrizzleNotificationDeliveryDecisionRepository(scope.db), (fact) =>
                  writer.append(fact),
                );
              },
              { isolationLevel: 'repeatable read' },
            ),
          new ResolveNotificationSubjects((work) => work(), directory),
          Date.now,
        ),
    },
    {
      provide: DecideNotificationDeliveryAuthorizationHandler,
      inject: [EventConsumers, DecideNotificationDeliveryAuthorization],
      useFactory: (
        events: EventConsumers,
        decide: DecideNotificationDeliveryAuthorization,
      ): DecideNotificationDeliveryAuthorizationHandler =>
        new DecideNotificationDeliveryAuthorizationHandler(events, decide),
    },
  ],
})
export class NotificationVisibilityModule {}
