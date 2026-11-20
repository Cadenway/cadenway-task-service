import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ListPlacement } from '../../../../models/placement/list-placement.model.js';
import type { PlacedList } from '../../../../models/placement/placed-list.model.js';
import type { TrashListLock } from '../../../../models/placement/trash-list-lock.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { BatchAssigneeRoles } from '../../../../ports/outbound/members/membership/batch-assignee-roles.port.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { ListCopyDestination } from '../../../../ports/outbound/spaces/list/list-copy-destination.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskCopyForest } from '../../../../services/task/task-copy-forest.service.js';
import { TaskEditGuard } from '../../../../services/task/task-edit-guard.service.js';
import type { DuplicateListInput } from './duplicate-list.input.js';
import type { DuplicateListOutput } from './duplicate-list.output.js';

const MAX_TASKS_IN_COPY = 500;

/** Creates the list and its complete live task forest in one tenant transaction. */
export class DuplicateList {
  // #region Properties
  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;
  private readonly forest: TaskCopyForest;
  private readonly editing = new TaskEditGuard();
  // #endregion

  // #region Constructor
  /** Uses the shared tenant transaction and the owning space and member operations. */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
    private readonly destination: ListCopyDestination,
    private readonly assignees: BatchAssigneeRoles,
  ) {
    this.viewers = new ViewerResolver(members);
    this.forest = new TaskCopyForest(spaces);
  }
  // #endregion

  // #region Methods
  /** Copies the source list and its live tasks after validating the actor and count. */
  public async execute(input: DuplicateListInput): Promise<DuplicateListOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<DuplicateListOutput> => {
      const { organizationId, actorUserId, listId, expectedVersions } = input;
      const viewer: Viewer = await this.viewers.resolve(organizationId, actorUserId, true);
      await this.requireSource(organizationId, viewer, listId);
      // One statement freezes the forest and its bound before membership and placement locks.
      const sources: readonly Task[] = await store.copies.listSources(
        organizationId,
        listId,
        MAX_TASKS_IN_COPY + 1,
      );
      const count: number = sources.length;
      const assignees: readonly AssigneeCandidate[] =
        count > MAX_TASKS_IN_COPY
          ? []
          : await this.assignees.hold(organizationId, [
              ...new Set(
                sources.flatMap((task: Task): readonly string[] => task.snapshot.assigneeIds),
              ),
            ]);
      const [held]: readonly TrashListLock[] = await this.spaces.lockTrashLists(
        organizationId,
        [listId],
        'hold',
        viewer,
      );
      if (held?.outcome !== 'live' || held.role === null) {
        throw new TaskRefusal({ reason: 'list-not-found' });
      }
      const source: ListPlacement = await this.requireSource(organizationId, viewer, listId);
      const { version } = source.list;
      if (expectedVersions !== null && !expectedVersions.includes(version)) {
        throw new TaskRefusal({ reason: 'version-mismatch', version });
      }
      if (count > MAX_TASKS_IN_COPY) {
        throw new TaskRefusal({ reason: 'list-duplicate-limit-reached' });
      }
      const list: PlacedList = await this.destination.create(
        organizationId,
        actorUserId,
        source.list.id,
      );
      if (count > 0) {
        await this.forest.create(
          store,
          sources,
          { list, space: source.space },
          assignees,
          organizationId,
          { type: 'user', id: actorUserId },
        );
      }
      return { list, taskCount: count };
    });
  }

  private async requireSource(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<ListPlacement> {
    const placement: ListPlacement | null = await this.spaces.findVisibleList(
      organizationId,
      viewer,
      listId,
    );
    if (placement === null) {
      throw new TaskRefusal({ reason: 'list-not-found' });
    }
    this.editing.requireEdit(placement.list);
    const { callerRole } = placement.space;
    if (callerRole !== 'edit') {
      throw new TaskRefusal({ reason: 'role-insufficient', role: callerRole });
    }
    return placement;
  }
  // #endregion
}
