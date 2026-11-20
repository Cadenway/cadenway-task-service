import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { SpaceStatusUse } from '../../../domain/value-objects/task/space-status-use.value-object.js';
import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskPatch } from '../../../domain/value-objects/task/task-patch.value-object.js';
import type { TaskUpdate } from '../../../domain/value-objects/task/task-update.value-object.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { ScheduledTaskUpdate } from '../../models/task/scheduled-task-update.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { TaskOccurrenceCreator } from './task-occurrence-creator.service.js';
import { TaskRuleGuard } from './task-rule-guard.service.js';

/** Reserves and creates a successor inside the task update's tenant transaction. */
export class TaskOccurrenceScheduler {
  // #region Properties
  /** The directory that allocates keys. */
  private readonly spaces: SpaceDirectory;

  /** Applies task invariants. */
  private readonly rules: TaskRuleGuard = new TaskRuleGuard();

  /** Creates the successor in the same transaction. */
  private readonly creator: TaskOccurrenceCreator = new TaskOccurrenceCreator();
  // #endregion

  // #region Constructor
  /** Binds key allocation. */
  public constructor(spaces: SpaceDirectory) {
    this.spaces = spaces;
  }
  // #endregion

  // #region Methods
  /**
   * Validates the patch and reserves a key only if the domain plans an occurrence. The caller
   * already holds the task, the destination placement and all assignee memberships until commit.
   *
   * @param source - The locked task before its update.
   * @param patch - The resolved task patch.
   * @param statuses - The destination space's statuses.
   * @param now - The transaction instant.
   * @returns The final update and optional successor to create after saving the source.
   */
  public async prepare(
    source: Task,
    patch: TaskPatch,
    statuses: SpaceStatusUse,
    now: Date,
  ): Promise<ScheduledTaskUpdate> {
    const preview: TaskUpdate = this.rules.apply(() => source.update(patch, statuses, now));
    if (preview.nextOccurrence === undefined) return { update: preview, successor: null };
    const state = preview.task.snapshot;
    const allocation = await this.spaces.allocateKeys(state.organizationId, state.spaceId, 1);
    const key = TaskKey.of(allocation.prefix, allocation.firstNumber);
    const update: TaskUpdate = this.rules.apply(() => source.update(patch, statuses, now, key));
    return { update, successor: { schedule: preview.nextOccurrence, key } };
  }

  /**
   * Writes the successor and its facts after the source update was recorded in the same store.
   *
   * @param store - Transaction-bound repositories and outbox.
   * @param planned - The validated, reserved update.
   * @param statuses - The destination space's statuses.
   * @param candidates - Roles held for the source's assignees.
   * @param actor - The actor completing the source.
   * @param now - The transaction instant.
   * @returns Resolves when any successor and its events have been written.
   */
  public async createSuccessor(
    store: TasksStore,
    planned: ScheduledTaskUpdate,
    statuses: SpaceStatusUse,
    candidates: readonly AssigneeCandidate[],
    actor: TaskActor,
    now: Date,
  ): Promise<void> {
    if (planned.successor === null) return;
    await this.creator.create(
      store,
      planned.update.task,
      planned.successor.schedule,
      planned.successor.key,
      statuses,
      candidates,
      actor,
      now,
    );
  }
  // #endregion
}
