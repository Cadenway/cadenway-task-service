import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { DelegatedMemberships } from '../../member/delegated-memberships/delegated-memberships.use-case.js';
import type { GetTaskVisibilityInput } from './get-task-visibility.input.js';
import type { GetTaskVisibilityOutput } from './get-task-visibility.output.js';

/** Resolves the current task visibility for one verified viewer in a bounded snapshot. */
export class GetTaskVisibility {
  // #region Constructor
  /** Binds the tenant transaction, current membership and list visibility. */
  public constructor(
    private readonly unit: TasksUnitOfWork,
    private readonly memberships: DelegatedMemberships,
    private readonly spaces: Pick<SpaceDirectory, 'findVisibleLists'>,
  ) {}
  // #endregion

  // #region Methods
  /** Leaves unknown, trashed and inaccessible tasks out without disclosing their state. */
  public async execute(input: GetTaskVisibilityInput): Promise<GetTaskVisibilityOutput> {
    if (input.taskKeys.length === 0 || input.taskKeys.length > 100) {
      throw new RangeError('Between 1 and 100 task keys are required.');
    }
    if (new Set(input.taskKeys).size !== input.taskKeys.length) {
      throw new RangeError('Task keys must be distinct.');
    }
    const keys = input.taskKeys.map((key) => TaskKey.parse(key));
    const proof = await this.memberships.execute(input.organizationId, [input.actorUserId]);

    return this.unit.runReadOnly(
      async (store) => {
        const viewer = await this.memberships.confirm(
          proof,
          input.organizationId,
          input.actorUserId,
          false,
        );
        if (viewer === null) return { visibleTaskKeys: [] };
        const locations = await store.reader.locationsByKeys(input.organizationId, keys);
        if (locations.length === 0) return { visibleTaskKeys: [] };
        const listIds = [...new Set(locations.map((task) => task.listId))];
        const lists = await this.spaces.findVisibleLists(input.organizationId, viewer, listIds);
        const visibleLists = new Set(lists.map((list) => list.id));
        const visibleKeys = new Set(
          locations.filter((task) => visibleLists.has(task.listId)).map((task) => task.key),
        );
        return { visibleTaskKeys: input.taskKeys.filter((key) => visibleKeys.has(key)) };
      },
      { snapshot: true },
    );
  }
  // #endregion
}
