import type { DatabaseSchema, TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { WatcherOverrideRepository } from '../../../../../application/ports/outbound/persistence/watcher/watcher-override-repository.port.js';
import { WATCHER_OVERRIDE_LIMIT } from '../../../../../domain/policies/watcher/watcher.policy.js';
import type { WatcherOverride } from '../../../../../domain/value-objects/watcher/watcher-override.value-object.js';
import { tasks } from '../../schemas/task/task.schema.js';
import { taskWatcherOverrides } from '../../schemas/watcher/task-watcher-override.schema.js';

/** Reads task watcher overrides inside the tenant transaction. */
export class DrizzleWatcherOverrideRepository implements WatcherOverrideRepository {
  // #region Properties
  /** Current transaction database. */
  private readonly db: TransactionDatabase<DatabaseSchema>;
  // #endregion
  // #region Constructor
  /** Binds the tenant database. */
  public constructor(db: TransactionDatabase<DatabaseSchema>) {
    this.db = db;
  }
  // #endregion
  // #region Methods
  /** Reads at most the contract maximum; refuses inconsistent excess rows. */
  public async list(organizationId: string, taskId: string): Promise<readonly WatcherOverride[]> {
    const rows = await this.db
      .select({ userId: taskWatcherOverrides.userId, following: taskWatcherOverrides.following })
      .from(taskWatcherOverrides)
      .where(
        and(
          eq(taskWatcherOverrides.organizationId, organizationId),
          eq(taskWatcherOverrides.taskId, taskId),
        ),
      )
      .orderBy(asc(taskWatcherOverrides.userId))
      .limit(WATCHER_OVERRIDE_LIMIT + 1);
    if (rows.length > WATCHER_OVERRIDE_LIMIT) {
      throw new Error('The task exceeds the watcher override limit.');
    }
    return rows;
  }

  /** Inserts or changes one override in the held task's transaction. */
  public async set(
    organizationId: string,
    taskId: string,
    override: WatcherOverride,
  ): Promise<void> {
    await this.db
      .insert(taskWatcherOverrides)
      .values({ organizationId, taskId, userId: override.userId, following: override.following })
      .onConflictDoUpdate({
        target: [
          taskWatcherOverrides.organizationId,
          taskWatcherOverrides.taskId,
          taskWatcherOverrides.userId,
        ],
        set: { following: override.following },
      });
  }

  /** Locks a tenant-scoped batch in task id order, without reading task contents. */
  public async lockTaskIdsForMember(
    organizationId: string,
    userId: string,
    afterTaskId: string | null,
    limit: number,
  ): Promise<readonly string[]> {
    const rows: { readonly taskId: string }[] = await this.db
      .select({ taskId: taskWatcherOverrides.taskId })
      .from(taskWatcherOverrides)
      .innerJoin(
        tasks,
        and(
          eq(tasks.organizationId, taskWatcherOverrides.organizationId),
          eq(tasks.id, taskWatcherOverrides.taskId),
        ),
      )
      .where(
        and(
          eq(taskWatcherOverrides.organizationId, organizationId),
          eq(taskWatcherOverrides.userId, userId),
          afterTaskId === null ? undefined : gt(taskWatcherOverrides.taskId, afterTaskId),
        ),
      )
      .orderBy(asc(taskWatcherOverrides.taskId))
      .limit(limit)
      .for('no key update', { of: tasks });
    return rows.map(({ taskId }: { readonly taskId: string }): string => taskId);
  }

  /** Removes this member's overrides from the locked task ids. */
  public async removeForMember(
    organizationId: string,
    userId: string,
    taskIds: readonly string[],
  ): Promise<number> {
    const removed: { readonly taskId: string }[] = await this.db
      .delete(taskWatcherOverrides)
      .where(
        and(
          eq(taskWatcherOverrides.organizationId, organizationId),
          eq(taskWatcherOverrides.userId, userId),
          inArray(taskWatcherOverrides.taskId, taskIds),
        ),
      )
      .returning({ taskId: taskWatcherOverrides.taskId });
    return removed.length;
  }
  // #endregion
}
