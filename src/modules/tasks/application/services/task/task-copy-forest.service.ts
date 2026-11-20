import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { SubtaskParent } from '../../../domain/value-objects/subtask/subtask-parent.value-object.js';
import { TaskKey } from '../../../domain/value-objects/task/task-key.value-object.js';
import type { EventActor } from '../../models/actor/event-actor.model.js';
import type { KeyAllocation } from '../../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../../models/placement/list-placement.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { TaskCopyCreator } from './task-copy-creator.service.js';

/** The maximum batch the space key allocator accepts. */
const KEY_BATCH_SIZE = 26;

/** Copies a coherent source forest parent first, keeping sibling order stable. */
export class TaskCopyForest {
  // #region Properties
  /** The single-task copy rule, also applied to each source in the forest. */
  private readonly creator = new TaskCopyCreator();
  // #endregion

  // #region Constructor
  /** Uses the normal task key allocator of the destination space. */
  public constructor(private readonly spaces: SpaceDirectory) {}
  // #endregion

  // #region Methods
  /** Clones the forest and remaps all parents present in the source snapshot. */
  public async create(
    store: TasksStore,
    sources: readonly Task[],
    placement: ListPlacement,
    assignees: readonly AssigneeCandidate[],
    organizationId: string,
    actor: EventActor & { readonly type: 'user' },
  ): Promise<void> {
    const ids: ReadonlySet<string> = new Set(
      sources.map((source: Task): string => source.snapshot.id),
    );
    const children = new Map<string | null, Task[]>();
    for (const task of sources) {
      const { parentId } = task.snapshot;
      const key: string | null = parentId !== null && ids.has(parentId) ? parentId : null;
      const siblings: Task[] = children.get(key) ?? [];
      siblings.push(task);
      children.set(key, siblings);
    }

    const now: Date = await store.clock.now();
    const candidates: ReadonlyMap<string, AssigneeCandidate> = new Map(
      assignees.map((candidate: AssigneeCandidate) => [candidate.userId, candidate]),
    );
    const keys: readonly TaskKey[] = await this.allocate(
      organizationId,
      placement.space.id,
      sources.length,
    );
    const branches: {
      readonly tasks: readonly Task[];
      readonly parent: Task | null;
      readonly level: number;
    }[] = [{ tasks: children.get(null) ?? [], parent: null, level: 1 }];
    let index = 0;
    for (const { tasks, parent, level } of branches) {
      for (const [position, source] of tasks.entries()) {
        const key: TaskKey | undefined = keys[index];
        if (key === undefined) {
          throw new Error('The list copy did not allocate enough task keys.');
        }
        const attachment: SubtaskParent | null = parent?.asParent(level - 1, position) ?? null;
        const task: Task = await this.creator.create(store, {
          source,
          placement,
          parent: attachment,
          key,
          assignees: source.snapshot.assigneeIds.flatMap(
            (userId: string): readonly AssigneeCandidate[] => {
              const candidate: AssigneeCandidate | undefined = candidates.get(userId);
              return candidate === undefined ? [] : [candidate];
            },
          ),
          actor,
          now,
          keepNameAndStatus: true,
        });
        index += 1;
        const descendants: readonly Task[] | undefined = children.get(source.snapshot.id);
        if (descendants !== undefined) {
          branches.push({ tasks: descendants, parent: task, level: level + 1 });
        }
      }
    }
    if (index !== sources.length) {
      throw new Error('The source list does not have an acyclic task forest.');
    }
  }

  private async allocate(
    organizationId: string,
    spaceId: string,
    count: number,
  ): Promise<readonly TaskKey[]> {
    const keys: TaskKey[] = [];
    while (keys.length < count) {
      const batch: number = Math.min(count - keys.length, KEY_BATCH_SIZE);
      const allocation: KeyAllocation = await this.spaces.allocateKeys(
        organizationId,
        spaceId,
        batch,
      );
      for (let offset = 0; offset < batch; offset += 1) {
        keys.push(TaskKey.of(allocation.prefix, allocation.firstNumber + offset));
      }
    }
    return keys;
  }
  // #endregion
}
