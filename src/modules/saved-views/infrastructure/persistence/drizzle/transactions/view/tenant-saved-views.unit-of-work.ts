import { eventSchemas } from '@cadenway/contracts/events/task-service';
import type { TenantTransactionRunner, TransactionOptions } from '@cadenway/nest-common/database';
import type { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';

import type { PurgeTargetFavorites } from '../../../../../../favorites/public/purge/purge-target-favorites.js';
import type { FindOrganizationMember } from '../../../../../../organization-members/public/membership/find-organization-member.js';
import type { FindVisibleList } from '../../../../../../spaces/public/list/find-visible-list.js';
import type { FindVisibleLists } from '../../../../../../spaces/public/list/find-visible-lists.js';
import type { LockTrashLists } from '../../../../../../spaces/public/list/lock-trash-lists.js';
import type { SavedViewPlacement } from '../../../../../application/models/view/saved-view-placement.model.js';
import type { SavedViewsUnitOfWork } from '../../../../../application/ports/outbound/transactions/view/saved-views-unit-of-work.port.js';
import type { SavedViewsStore } from '../../../../../application/models/view/saved-views-store.model.js';
import type { SavedViewViewer } from '../../../../../application/models/view/saved-view-viewer.model.js';
import { DrizzleSavedViewRepository } from '../../repositories/view/drizzle-saved-view.repository.js';

/** Binds all saved-view collaborators and the outbox to one tenant transaction. */
export class TenantSavedViewsUnitOfWork implements SavedViewsUnitOfWork {
  // #region Constructor
  /** Takes the same tenant runner and context as the other modules' public operations. */
  public constructor(
    private readonly runner: TenantTransactionRunner,
    private readonly outbox: OutboxWriter,
    private readonly relay: OutboxRelay,
    private readonly findMember: FindOrganizationMember,
    private readonly findVisibleList: FindVisibleList,
    private readonly findVisibleLists: FindVisibleLists,
    private readonly lockTrashLists: LockTrashLists,
    private readonly purgeTargetFavorites: PurgeTargetFavorites,
  ) {}
  // #endregion

  // #region Methods
  /** Joins a current operation or opens a tenant transaction for a view change. */
  public run<T>(work: (store: SavedViewsStore) => Promise<T>): Promise<T> {
    return this.execute(work, {});
  }

  /** Reads a REST view and its current authorization in one consistent tenant snapshot. */
  public read<T>(work: (store: SavedViewsStore) => Promise<T>): Promise<T> {
    return this.execute(work, { isolationLevel: 'repeatable read', readOnly: true });
  }

  /** Keeps cross-module access checks, record changes and event append in the same unit of work. */
  private async execute<T>(
    work: (store: SavedViewsStore) => Promise<T>,
    options: TransactionOptions,
  ): Promise<T> {
    const resultState = { appended: false };
    const result = await this.runner.run(
      (transaction) =>
        work({
          views: new DrizzleSavedViewRepository(transaction.db),
          findViewer: async (caller, lock) => {
            const member = await this.findMember.execute({
              organizationId: caller.organizationId,
              userId: caller.actorUserId,
              lock,
            });
            return member === null ? null : { ...caller, role: member.role };
          },
          findPlacement: (viewer, listId, lock) => this.findPlacement(viewer, listId, lock),
          findActiveListIds: (viewer, listIds) => this.findActiveListIds(viewer, listIds),
          appendFact: async (caller, spaceId, view, action) => {
            await this.outbox.append(transaction, eventSchemas, 'list.saved-view-changed.v1', {
              organizationId: caller.organizationId,
              actor: { type: 'user', id: caller.actorUserId },
              listId: view.listId,
              spaceId,
              viewId: view.id,
              action,
              version: view.version,
            });
            resultState.appended = true;
          },
          purgeFavorites: async (organizationId, viewId) => {
            await this.purgeTargetFavorites.execute({
              organizationId,
              kind: 'saved-view',
              targetIds: [viewId],
            });
          },
        }),
      options,
    );
    if (resultState.appended) this.relay.wake();
    return result;
  }

  /** Rechecks visibility and archive status while the write holds the list and its space. */
  private async findPlacement(
    viewer: SavedViewViewer,
    listId: string,
    lock: boolean,
  ): Promise<SavedViewPlacement | null> {
    const input = {
      organizationId: viewer.organizationId,
      viewerUserId: viewer.actorUserId,
      viewerRole: viewer.role,
      listId,
    };
    const initial = await this.findVisibleList.execute(input);
    if (initial === null) return null;
    if (!lock) {
      return {
        spaceId: initial.list.spaceId,
        role: initial.list.callerRole,
        archivedAt: initial.list.archivedAt,
      };
    }
    const locked = await this.lockTrashLists.execute({
      organizationId: viewer.organizationId,
      listIds: [listId],
      mode: 'hold',
      viewer: { userId: viewer.actorUserId, role: viewer.role },
    });
    const placement = locked.lists[0];
    if (placement?.outcome !== 'live' || placement.role === null) return null;
    const current = await this.findVisibleList.execute(input);
    return current === null
      ? null
      : {
          spaceId: current.list.spaceId,
          role: current.list.callerRole,
          archivedAt: current.list.archivedAt,
        };
  }

  /** Filters favorite targets in batches of the Spaces read API's published bound. */
  private async findActiveListIds(
    viewer: SavedViewViewer,
    listIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    const active = new Set<string>();
    for (let start = 0; start < listIds.length; start += 100) {
      const visible = await this.findVisibleLists.execute({
        organizationId: viewer.organizationId,
        viewerUserId: viewer.actorUserId,
        viewerRole: viewer.role,
        listIds: listIds.slice(start, start + 100),
      });
      for (const list of visible.lists) {
        if (list.archivedAt === null) active.add(list.id);
      }
    }
    return active;
  }
  // #endregion
}
