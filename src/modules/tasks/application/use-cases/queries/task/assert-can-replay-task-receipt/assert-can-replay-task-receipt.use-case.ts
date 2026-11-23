import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { ReadonlyTasksStore } from '../../../../models/transactions/readonly-tasks-store.model.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';

import type { AssertCanReplayTaskReceiptInput } from './assert-can-replay-task-receipt.input.js';

type TrashReceipt = NonNullable<AssertCanReplayTaskReceiptInput['trash']>[number];

/** Checks the current visibility of the resources represented by a stored mutation receipt. */
export class AssertCanReplayTaskReceipt {
  // #region Properties
  /** Resolves the viewer's current projected organization role. */
  private readonly viewers: ViewerResolver;

  /** Checks the existing trash visibility rules for remembered entries. */
  private readonly tasks: TaskLocator;
  // #endregion

  // #region Constructor
  /** Binds the tenant unit of work and current authorization directories. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.tasks = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /** Reads the viewer, historical scope and current visibility from one snapshot. */
  public async execute(input: AssertCanReplayTaskReceiptInput): Promise<void> {
    const { organizationId, actorUserId, taskKeys, listIds, bulk, trash = [], notFound } = input;
    const keys = [...new Set(taskKeys)].map((key) => TaskKey.parse(key));
    const visibleListIds = new Set(listIds.map((id) => id.toLowerCase()));
    await this.work.runReadOnly(
      async (store) => {
        const viewer = await this.viewers.resolve(organizationId, actorUserId);
        if (bulk !== undefined) {
          const originalLists = await store.bulkReceipts.find(
            organizationId,
            bulk.key,
            bulk.serializedResponse,
          );
          if (originalLists === null) throw new TaskRefusal({ reason: notFound });
          for (const listId of originalLists) visibleListIds.add(listId);
        }
        if (keys.length > 0) {
          const locations = await store.reader.locationsByKeys(organizationId, keys);
          if (locations.length !== keys.length) throw new TaskRefusal({ reason: notFound });
          for (const location of locations) visibleListIds.add(location.listId);
        }
        const lists = [...visibleListIds];
        for (let offset = 0; offset < lists.length; offset += 100) {
          const batch = lists.slice(offset, offset + 100);
          const visible = await this.spaces.findVisibleLists(organizationId, viewer, batch);
          if (visible.length !== batch.length) throw new TaskRefusal({ reason: notFound });
        }
        for (const receipt of trash) {
          if (!(await this.canSeeTrashReceipt(store, organizationId, viewer, receipt))) {
            throw new TaskRefusal({ reason: notFound });
          }
        }
      },
      { snapshot: true },
    );
  }

  private async canSeeTrashReceipt(
    store: ReadonlyTasksStore,
    organizationId: string,
    viewer: Viewer,
    receipt: TrashReceipt,
  ): Promise<boolean> {
    try {
      await this.tasks.locate(store, {
        organizationId,
        viewer,
        taskKey: receipt.taskKey,
        edit: false,
        lock: false,
        archived: 'allow',
        expectedVersions: null,
      });
      return false;
    } catch (error) {
      if (!(error instanceof TaskRefusal)) throw error;
      const refusal = error.refusal;
      return refusal.reason === 'task-trashed' && refusal.entryId === receipt.entryId;
    }
  }
  // #endregion
}
