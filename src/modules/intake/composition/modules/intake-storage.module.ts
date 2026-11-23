import { Module } from '@nestjs/common';

import { PurgeDeletedListIntake } from '../../public/form/purge-deleted-list-intake.js';
import { PurgeIntakeContacts } from '../../public/form/purge-intake-contacts.js';
import { RevokeDeletedListIntake } from '../../public/form/revoke-deleted-list-intake.js';
import { intakeCleanupProviders } from '../providers/use-cases/form/intake-cleanup.provider.js';

/** Makes only lifecycle cleanup available to the modules that own lists and tasks. */
@Module({
  providers: intakeCleanupProviders,
  exports: [RevokeDeletedListIntake, PurgeDeletedListIntake, PurgeIntakeContacts],
})
export class IntakeStorageModule {}
