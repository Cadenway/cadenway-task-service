import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';

import { DrizzleSavedViewRepository } from '../../infrastructure/persistence/drizzle/repositories/view/drizzle-saved-view.repository.js';
import { RemoveListSavedViews } from '../../public/view/remove-list-saved-views.js';

/** Supplies saved-view cleanup in the caller's existing tenant transaction. */
@Module({
  providers: [
    {
      provide: RemoveListSavedViews,
      inject: [TenantTransactionRunner],
      useFactory: (runner: TenantTransactionRunner): RemoveListSavedViews =>
        new RemoveListSavedViews((organizationId, listIds) =>
          runner.run(({ db }) =>
            new DrizzleSavedViewRepository(db).removeLists(organizationId, listIds),
          ),
        ),
    },
  ],
  exports: [RemoveListSavedViews],
})
export class SavedViewsStorageModule {}
