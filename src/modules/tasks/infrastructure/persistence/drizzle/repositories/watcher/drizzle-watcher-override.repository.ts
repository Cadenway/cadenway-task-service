import type { DatabaseSchema, TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq } from 'drizzle-orm';
import type { WatcherOverrideRepository } from '../../../../../application/ports/outbound/persistence/watcher/watcher-override-repository.port.js';
import type { WatcherOverride } from '../../../../../domain/value-objects/watcher/watcher-override.value-object.js';
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
      .limit(101);
    if (rows.length > 100) throw new Error('The task exceeds the watcher override limit.');
    return rows;
  }
  // #endregion
}
