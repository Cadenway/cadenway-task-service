import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { JobProducer } from '@cadenway/nest-jobs/runtime';
import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import type { FactoryProvider } from '@nestjs/common';

import { PurgeTargetFavorites } from '../../../../../favorites/public/purge/purge-target-favorites.js';
import { PurgeDeletedListIntake } from '../../../../../intake/public/form/purge-deleted-list-intake.js';
import { RevokeDeletedListIntake } from '../../../../../intake/public/form/revoke-deleted-list-intake.js';
import { RemoveListSavedViews } from '../../../../../saved-views/public/view/remove-list-saved-views.js';
import { RemoveSpaceTaskTemplates } from '../../../../../task-templates/public/template/remove-space-task-templates.js';
import type { SpaceLibraryCleanup } from '../../../../application/ports/outbound/library/space/space-library-cleanup.port.js';
import type { SpacesUnitOfWork } from '../../../../application/ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { TenantSpacesUnitOfWork } from '../../../../infrastructure/persistence/drizzle/transactions/space/tenant-spaces.unit-of-work.js';
import { SPACES_UNIT_OF_WORK } from '../../../tokens/space/spaces-unit-of-work.token.js';

/**
 * Constant spacesUnitOfWorkProvider
 *
 * @description
 * Binds the unit of work of the module to the tenant runner of the kit, with the outbox writer
 * that appends the events in the same transaction, the relay woken after the commit, and the job
 * producer of `JobsRuntimeModule`, which enqueues the job of a deletion through the same
 * transaction.
 *
 * @type {FactoryProvider<SpacesUnitOfWork>}
 */
export const spacesUnitOfWorkProvider: FactoryProvider<SpacesUnitOfWork> = {
  provide: SPACES_UNIT_OF_WORK,
  inject: [
    TenantTransactionRunner,
    OutboxWriter,
    OutboxRelay,
    JobProducer,
    RemoveListSavedViews,
    RemoveSpaceTaskTemplates,
    PurgeTargetFavorites,
    RevokeDeletedListIntake,
    PurgeDeletedListIntake,
  ],
  useFactory: (
    runner: TenantTransactionRunner,
    outbox: OutboxWriter,
    relay: OutboxRelay,
    jobs: JobProducer,
    views: RemoveListSavedViews,
    templates: RemoveSpaceTaskTemplates,
    favorites: PurgeTargetFavorites,
    revokeIntake: RevokeDeletedListIntake,
    purgeIntake: PurgeDeletedListIntake,
  ): SpacesUnitOfWork => {
    const libraryCleanup: SpaceLibraryCleanup = {
      async removeListViews(organizationId, listIds): Promise<void> {
        const targetIds = await views.execute({ organizationId, listIds });
        await favorites.execute({ organizationId, kind: 'saved-view', targetIds });
      },
      revokeListIntake: (organizationId, listIds): Promise<void> =>
        revokeIntake.execute({ organizationId, listIds }),
      purgeListIntake: (organizationId, listId): Promise<void> =>
        purgeIntake.execute({ organizationId, listId }),
      removeSpaceTemplates: (organizationId, spaceId): Promise<void> =>
        templates.execute(organizationId, spaceId),
      purgeTargetFavorites: (organizationId, kind, targetIds): Promise<void> =>
        favorites.execute({ organizationId, kind, targetIds }),
    };
    return new TenantSpacesUnitOfWork(runner, outbox, relay, jobs, libraryCleanup);
  },
};
