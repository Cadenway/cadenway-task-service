import { Idempotent, TenantTransactionRunner } from '@cadenway/nest-common/database';
import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { FavoritesStorageModule } from '../favorites/composition/modules/favorites-storage.module.js';
import { SavedViewReplayAccessInterceptor } from './composition/providers/adapters/view/saved-views-replay-access.provider.js';

import { PurgeTargetFavorites } from '../favorites/public/purge/purge-target-favorites.js';
import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { FindOrganizationMember } from '../organization-members/public/membership/find-organization-member.js';
import { FindVisibleList } from '../spaces/public/list/find-visible-list.js';
import { FindVisibleLists } from '../spaces/public/list/find-visible-lists.js';
import { LockTrashLists } from '../spaces/public/list/lock-trash-lists.js';
import { SpacesModule } from '../spaces/spaces.module.js';
import { CreateSavedView } from './application/use-cases/commands/view/create-saved-view/create-saved-view.use-case.js';
import { DeleteSavedView } from './application/use-cases/commands/view/delete-saved-view/delete-saved-view.use-case.js';
import { DuplicateSavedView } from './application/use-cases/commands/view/duplicate-saved-view/duplicate-saved-view.use-case.js';
import { UpdateSavedView } from './application/use-cases/commands/view/update-saved-view/update-saved-view.use-case.js';
import { GetSavedView } from './application/use-cases/queries/view/get-saved-view/get-saved-view.use-case.js';
import { ListSavedViews } from './application/use-cases/queries/view/list-saved-views/list-saved-views.use-case.js';
import { TenantSavedViewsUnitOfWork } from './infrastructure/persistence/drizzle/transactions/view/tenant-saved-views.unit-of-work.js';
import { SavedViewsController } from './presentation/http/controllers/view/saved-views.controller.js';
import { FindFavoriteSavedView } from './public/view/find-favorite-saved-view.js';

/** Marks both creations for the kit's 24-hour Idempotency-Key handling. */
function markIdempotent(method: 'create' | 'duplicate'): void {
  const prototype: object = SavedViewsController.prototype;
  const handler = Object.getOwnPropertyDescriptor(prototype, method);
  if (handler === undefined) throw new Error(`Saved view handler ${method} is missing.`);
  Idempotent()(prototype, method, handler);
}

markIdempotent('create');
markIdempotent('duplicate');

/** Binds the operations to the shared tenant unit of work without importing infrastructure in them. */
const operations = [
  CreateSavedView,
  DeleteSavedView,
  DuplicateSavedView,
  FindFavoriteSavedView,
  GetSavedView,
  ListSavedViews,
  UpdateSavedView,
].map((operation) => ({
  provide: operation,
  inject: [TenantSavedViewsUnitOfWork],
  useFactory: (unitOfWork: TenantSavedViewsUnitOfWork) => new operation(unitOfWork),
}));

/** Composes the shared saved-view routes and the visibility-checked favorite lookup. */
@Module({
  imports: [OrganizationMembersModule, SpacesModule, FavoritesStorageModule],
  controllers: [SavedViewsController],
  providers: [
    {
      provide: TenantSavedViewsUnitOfWork,
      inject: [
        TenantTransactionRunner,
        OutboxWriter,
        OutboxRelay,
        FindOrganizationMember,
        FindVisibleList,
        FindVisibleLists,
        LockTrashLists,
        PurgeTargetFavorites,
      ],
      useFactory: (
        runner: TenantTransactionRunner,
        outbox: OutboxWriter,
        relay: OutboxRelay,
        findMember: FindOrganizationMember,
        findList: FindVisibleList,
        findLists: FindVisibleLists,
        lockLists: LockTrashLists,
        purgeFavorites: PurgeTargetFavorites,
      ): TenantSavedViewsUnitOfWork =>
        new TenantSavedViewsUnitOfWork(
          runner,
          outbox,
          relay,
          findMember,
          findList,
          findLists,
          lockLists,
          purgeFavorites,
        ),
    },
    { provide: APP_INTERCEPTOR, useClass: SavedViewReplayAccessInterceptor },
    ...operations,
  ],
  exports: [FindFavoriteSavedView],
})
export class SavedViewsModule {}
