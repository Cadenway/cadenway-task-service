import { ActivityEntry } from '../../../../../domain/aggregates/activity/activity-entry.aggregate.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { RecordCommentActivityInput } from './record-comment-activity.input.js';
import type { RecordCommentActivityOutput } from './record-comment-activity.output.js';

/** Records a comment activity entry under the task lock held by BeginComment. */
export class RecordCommentActivity {
  // #region Properties
  /** Tenant transaction. */
  private readonly unit: TasksUnitOfWork;
  // #endregion

  // #region Constructor
  /** Takes the task transaction port. */
  public constructor(unit: TasksUnitOfWork) {
    this.unit = unit;
  }
  // #endregion

  // #region Methods
  /** Appends the activity entry in the caller's transaction. */
  public async execute(input: RecordCommentActivityInput): Promise<RecordCommentActivityOutput> {
    return this.unit.run(async (store: TasksStore): Promise<RecordCommentActivityOutput> => {
      const task = await store.tasks.findByKey(
        input.organizationId,
        TaskKey.parse(input.taskKey),
        false,
      );
      if (task?.snapshot.version !== input.taskVersion)
        throw new Error('The locked task is not at the expected comment version.');
      if (input.change !== undefined) {
        await store.activity.changeComment(
          input.organizationId,
          task.snapshot.id,
          input.commentId,
          input.change === 'delete' ? null : input.excerpt,
        );
        return undefined;
      }
      await store.activity.insert([
        ActivityEntry.forComment(
          task.snapshot,
          input.actor ?? { type: 'user', id: input.actorUserId },
          await store.clock.now(),
          input.commentId,
          input.excerpt,
        ),
      ]);
      return undefined;
    });
  }
  // #endregion
}
