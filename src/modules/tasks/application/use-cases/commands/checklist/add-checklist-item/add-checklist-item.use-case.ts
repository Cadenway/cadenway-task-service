import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ChecklistItemDraft } from '../../../../../domain/value-objects/task/checklist-item-draft.value-object.js';
import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';
import type { TaskUpdate } from '../../../../../domain/value-objects/task/task-update.value-object.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import type { AddChecklistItemInput } from './add-checklist-item.input.js';
import type { AddChecklistItemOutput } from './add-checklist-item.output.js';

/**
 * Class AddChecklistItem
 *
 * @description
 * Adds an unticked item at the end of the checklist of a task the actor sees
 * (`POST /internal/v1/tasks/{taskKey}/checklist-items`). The route is idempotent through
 * `Idempotency-Key`, whose transaction `run` joins. The domain drafts the item (`Task.draftChecklistItem`:
 * trimmed text, position, `checklist-limit-reached` at 100), the repository stores it and gives
 * its id, then the domain adds it (`Task.addChecklistItem`). The task takes a new version and
 * `task.updated.v1` (`changed: ['checklist']`) is appended; the checklist is not recorded in the
 * activity.
 */
export class AddChecklistItem {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Maps the refusals of the domain. */
  private readonly rules: TaskRuleGuard;

  /** Writes the change. */
  private readonly writer: TaskChangeWriter;

  /** Builds the view of the task. */
  private readonly views: TaskViewBuilder;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the two directories.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.unitOfWork = unitOfWork;
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
    this.rules = new TaskRuleGuard();
    this.writer = new TaskChangeWriter();
    this.views = new TaskViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Adds the item.
   *
   * @param {AddChecklistItemInput} input - The actor, the task and the text.
   * @returns {Promise<AddChecklistItemOutput>} The task after the change and the id of the item.
   * @throws {TaskRefusal} `organization-not-found`, `task-not-found`, `role-insufficient`,
   * `task-archived` or `checklist-limit-reached`.
   */
  public async execute(input: AddChecklistItemInput): Promise<AddChecklistItemOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<AddChecklistItemOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const { task }: LocatedTask = await this.locator.locate(store, {
        organizationId: input.organizationId,
        viewer,
        taskKey: input.taskKey,
        edit: true,
        lock: true,
        archived: 'refuse',
        expectedVersions: null,
      });
      const now: Date = await store.clock.now();
      const draft: ChecklistItemDraft = this.rules.apply((): ChecklistItemDraft =>
        task.draftChecklistItem(input.text),
      );
      const item: ChecklistItemState = await store.tasks.insertChecklistItem(
        input.organizationId,
        task.snapshot.id,
        draft,
      );
      const update: TaskUpdate = this.rules.apply((): TaskUpdate =>
        task.addChecklistItem(item, now),
      );
      await this.writer.commit(store, task, update, input.actorUserId, now);
      return {
        task: await this.views.build(store.reader, update.task),
        checklistItemId: item.id,
      };
    });
  }
  // #endregion
}
