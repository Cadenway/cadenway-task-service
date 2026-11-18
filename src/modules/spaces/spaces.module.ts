import { Idempotent } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';

import { OrganizationMembersModule } from '../organization-members/organization-members.module.js';
import { memberDirectoryProvider } from './composition/providers/adapters/membership/member-directory.provider.js';
import { spacesUnitOfWorkProvider } from './composition/providers/adapters/space/spaces-unit-of-work.provider.js';
import { createListProvider } from './composition/providers/use-cases/list/create-list.provider.js';
import { getListProvider } from './composition/providers/use-cases/list/get-list.provider.js';
import { listListsProvider } from './composition/providers/use-cases/list/list-lists.provider.js';
import { updateListProvider } from './composition/providers/use-cases/list/update-list.provider.js';
import { createSpaceProvider } from './composition/providers/use-cases/space/create-space.provider.js';
import { getSpaceProvider } from './composition/providers/use-cases/space/get-space.provider.js';
import { handOverAwaitingSpacesProvider } from './composition/providers/use-cases/space/hand-over-awaiting-spaces.provider.js';
import { handOverPrivateSpacesProvider } from './composition/providers/use-cases/space/hand-over-private-spaces.provider.js';
import { listSpacesProvider } from './composition/providers/use-cases/space/list-spaces.provider.js';
import { updateSpaceProvider } from './composition/providers/use-cases/space/update-space.provider.js';
import { ListsController } from './presentation/http/controllers/list/lists.controller.js';
import { SpaceListsController } from './presentation/http/controllers/list/space-lists.controller.js';
import { SpacesController } from './presentation/http/controllers/space/spaces.controller.js';
import { HandOverAwaitingSpaces } from './public/space/hand-over-awaiting-spaces.js';
import { HandOverPrivateSpaces } from './public/space/hand-over-private-spaces.js';

/**
 * Function markIdempotent
 *
 * @description
 * Marks a creation route `@Idempotent()`, so that the `Idempotency-Key` interceptor of
 * `DatabaseModule` (`idempotency: true` in `AppModule`) records its answer with the key for 24 hours
 * and replays it ("Creations" of `openapi/internal/task-service.yaml`). The decorator of the kit
 * lives in `@cadenway/nest-common/database`, an adapter entry the strict layout keeps out of
 * `presentation/`; the composition root applies it to the handler instead, the same metadata the
 * decorator would set.
 *
 * @param {object} prototype - The prototype of the controller.
 * @param {string} method - The name of its creation handler.
 * @throws {Error} When the controller has no such handler: the module does not load.
 */
function markIdempotent(prototype: object, method: string): void {
  const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
    prototype,
    method,
  );
  if (descriptor === undefined) {
    throw new Error(`The controller has no handler ${method} to mark idempotent.`);
  }
  Idempotent()(prototype, method, descriptor);
}

markIdempotent(SpacesController.prototype, 'create');
markIdempotent(SpaceListsController.prototype, 'create');

/**
 * Class SpacesModule
 *
 * @description
 * Composition root of the spaces, their statuses, their task key prefixes and their lists and
 * sprints (P3a). The use cases run on one tenant unit of work that appends their events to the
 * outbox in the same transaction, and read the roles and the owner from `OrganizationMembersModule`
 * through the `MemberDirectory` port, never from the `role` claim of the internal token (decision 4
 * of the P3a plan). It exports `HandOverPrivateSpaces`, which the member-lifecycle module runs when
 * a member leaves the organization.
 */
@Module({
  imports: [OrganizationMembersModule],
  controllers: [SpacesController, SpaceListsController, ListsController],
  providers: [
    spacesUnitOfWorkProvider,
    memberDirectoryProvider,
    createSpaceProvider,
    listSpacesProvider,
    getSpaceProvider,
    updateSpaceProvider,
    handOverPrivateSpacesProvider,
    handOverAwaitingSpacesProvider,
    createListProvider,
    listListsProvider,
    getListProvider,
    updateListProvider,
  ],
  exports: [HandOverPrivateSpaces, HandOverAwaitingSpaces],
})
export class SpacesModule {}
