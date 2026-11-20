import { Global, Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { intakeUnitOfWorkProvider } from './composition/providers/adapters/form/intake-unit-of-work.provider.js';
import { intakeCleanupProviders } from './composition/providers/use-cases/form/intake-cleanup.provider.js';
import { intakeUseCaseProviders } from './composition/providers/use-cases/form/intake.provider.js';
import { PurgeDeletedListIntake } from './public/form/purge-deleted-list-intake.js';
import { PurgeIntakeContacts } from './public/form/purge-intake-contacts.js';
import { RevokeDeletedListIntake } from './public/form/revoke-deleted-list-intake.js';

/** Wires list intake to the public operations of the modules that own membership and tasks. */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, TasksModule],
  providers: [intakeUnitOfWorkProvider, ...intakeUseCaseProviders],
})
export class IntakeModule {}

/** Makes only lifecycle cleanup available to the modules that own lists and tasks. */
@Global()
@Module({
  providers: intakeCleanupProviders,
  exports: [RevokeDeletedListIntake, PurgeDeletedListIntake, PurgeIntakeContacts],
})
export class IntakeStorageModule {}
