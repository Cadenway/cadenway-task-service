import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import type { TimeTaskActor } from '../../models/time/time-task-actor.model.js';
import type { ReadonlyTasksStore } from '../../models/transactions/readonly-tasks-store.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { ViewerResolver } from '../member/viewer-resolver.service.js';
import { TaskLocator } from '../task/task-locator.service.js';

/** Resolves task access inside the caller's transaction. */
export class TimeTaskAccess {
  // #region Properties
  /** The dependencies of this operation. */
  private readonly viewers: ViewerResolver;
  private readonly locator: TaskLocator;
  // #endregion

  // #region Constructor
  /** Initializes the operation with its transaction and access directories. */
  public constructor(members: MemberDirectory, spaces: SpaceDirectory) {
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /** Runs the operation in the requested transaction. */
  public locate(store: TasksStore, input: TimeTaskActor, mode: 'write'): Promise<LocatedTask>;
  public locate(
    store: ReadonlyTasksStore,
    input: TimeTaskActor,
    mode: 'read' | 'replay',
  ): Promise<LocatedTask>;
  public async locate(
    store: ReadonlyTasksStore | TasksStore,
    input: TimeTaskActor,
    mode: 'read' | 'write' | 'replay',
  ): Promise<LocatedTask> {
    const write: boolean = mode === 'write';
    const viewer: Viewer = await this.viewers.resolve(
      input.organizationId,
      input.actorUserId,
      write,
    );
    const request = {
      organizationId: input.organizationId,
      viewer,
      taskKey: input.taskKey,
      edit: mode !== 'read',
      archived: mode === 'read' ? ('allow' as const) : ('refuse' as const),
      expectedVersions: null,
    };
    if (write) {
      if (!('savepoint' in store)) throw new Error('Task row locking requires a writable store.');
      return this.locator.locate(store, { ...request, lock: true });
    }
    return this.locator.locate(store, { ...request, lock: false });
  }
  // #endregion
}
