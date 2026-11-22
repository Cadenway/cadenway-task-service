import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { LocatedTask } from '../../models/task/located-task.model.js';
import type { TimeTaskActor } from '../../models/time/time-task-actor.model.js';
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
  public async locate(
    store: TasksStore,
    input: TimeTaskActor,
    mode: 'read' | 'write' | 'replay',
  ): Promise<LocatedTask> {
    const write: boolean = mode === 'write';
    const viewer: Viewer = await this.viewers.resolve(
      input.organizationId,
      input.actorUserId,
      write,
    );
    return this.locator.locate(store, {
      organizationId: input.organizationId,
      viewer,
      taskKey: input.taskKey,
      edit: mode !== 'read',
      lock: write,
      archived: mode === 'read' ? 'allow' : 'refuse',
      expectedVersions: null,
    });
  }
  // #endregion
}
