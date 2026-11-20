import { Global, Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { expireIntakeAttachmentDraftsHandlerProvider } from './composition/providers/adapters/attachment/expire-intake-attachment-drafts-handler.provider.js';
import { intakeAttachmentEventProviders } from './composition/providers/adapters/attachment/intake-attachment-events.provider.js';
import { intakeUnitOfWorkProvider } from './composition/providers/adapters/form/intake-unit-of-work.provider.js';
import { purgeIntakeReceiptsHandlerProvider } from './composition/providers/adapters/form/purge-intake-receipts-handler.provider.js';
import { intakeCleanupProviders } from './composition/providers/use-cases/form/intake-cleanup.provider.js';
import { intakeUseCaseProviders } from './composition/providers/use-cases/form/intake.provider.js';
import { purgeExpiredIntakeReceiptsProvider } from './composition/providers/use-cases/form/purge-expired-intake-receipts.provider.js';
import { IntakeController } from './presentation/http/controllers/form/intake.controller.js';
import { PurgeDeletedListIntake } from './public/form/purge-deleted-list-intake.js';
import { PurgeIntakeContacts } from './public/form/purge-intake-contacts.js';
import { RevokeDeletedListIntake } from './public/form/revoke-deleted-list-intake.js';

/** Wires list intake to the public operations of the modules that own membership and tasks. */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, TasksModule],
  controllers: [IntakeController],
  providers: [
    intakeUnitOfWorkProvider,
    ...intakeUseCaseProviders,
    ...intakeAttachmentEventProviders,
    expireIntakeAttachmentDraftsHandlerProvider,
    purgeExpiredIntakeReceiptsProvider,
    purgeIntakeReceiptsHandlerProvider,
  ],
})
export class IntakeModule {}

/** Makes only lifecycle cleanup available to the modules that own lists and tasks. */
@Global()
@Module({
  providers: intakeCleanupProviders,
  exports: [RevokeDeletedListIntake, PurgeDeletedListIntake, PurgeIntakeContacts],
})
export class IntakeStorageModule {}
