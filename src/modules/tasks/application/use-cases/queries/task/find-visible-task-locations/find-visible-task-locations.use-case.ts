import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskLocation } from '../../../../projections/task/task-location.projection.js';
import type { FindVisibleTaskLocationsInput } from './find-visible-task-locations.input.js';
import type { FindVisibleTaskLocationsOutput } from './find-visible-task-locations.output.js';

/** Canonical UUID text accepted by PostgreSQL for a task identifier. */
const UUID: RegExp = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Resolves readable task locations for an already verified organization member. */
export class FindVisibleTaskLocations {
  // #region Constructor
  /** Binds the tenant transaction and the canonical list visibility reader. */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    private readonly spaces: Pick<SpaceDirectory, 'findVisibleLists'>,
  ) {}
  // #endregion

  // #region Methods
  /** Joins the caller's transaction and omits unknown, trashed and inaccessible tasks. */
  public async execute(
    input: FindVisibleTaskLocationsInput,
  ): Promise<FindVisibleTaskLocationsOutput> {
    if (input.taskIds.length + input.taskKeys.length > 100) {
      throw new RangeError('At most 100 task identifiers can be read at once.');
    }
    const taskIds = [
      ...new Set(input.taskIds.filter((id) => UUID.test(id)).map((id) => id.toLowerCase())),
    ];
    const keys = [...new Set(input.taskKeys.filter((key) => TaskKey.isKey(key)))].map((key) =>
      TaskKey.parse(key),
    );
    if (taskIds.length === 0 && keys.length === 0) return { tasks: [] };

    return this.unitOfWork.run(async (store) => {
      const byId =
        taskIds.length === 0
          ? []
          : await store.reader.locationsByIds(input.organizationId, taskIds);
      const byKey =
        keys.length === 0 ? [] : await store.reader.locationsByKeys(input.organizationId, keys);
      const locations = [...new Map([...byId, ...byKey].map((task) => [task.id, task])).values()];
      if (locations.length === 0) return { tasks: [] };
      const listIds = [...new Set(locations.map((task) => task.listId))];
      const visibleLists = await this.spaces.findVisibleLists(
        input.organizationId,
        input.viewer,
        listIds,
      );
      const visibleIds = new Set(visibleLists.map((list) => list.id));
      return { tasks: locations.filter((task: TaskLocation) => visibleIds.has(task.listId)) };
    });
  }
  // #endregion
}
