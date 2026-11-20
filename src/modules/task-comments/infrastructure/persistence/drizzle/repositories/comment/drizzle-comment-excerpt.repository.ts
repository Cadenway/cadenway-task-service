import type { DatabaseSchema, TransactionDatabase } from '@cadenway/nest-common/database';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';

import type { CommentExcerptPair } from '../../../../../application/models/comment/comment-excerpt-pair.model.js';
import type { CommentExcerptRecord } from '../../../../../application/models/comment/comment-excerpt-record.model.js';
import type { CommentExcerptReader } from '../../../../../application/ports/outbound/persistence/comment/comment-excerpt-reader.port.js';
import { taskComments } from '../../schemas/comment/task-comment.schema.js';

/** Reads live comment bodies using the caller's tenant transaction and snapshot. */
export class DrizzleCommentExcerptReader implements CommentExcerptReader {
  // #region Properties
  /** Transaction-scoped database. */
  private readonly db: TransactionDatabase<DatabaseSchema>;
  // #endregion

  // #region Constructor
  /** Binds the reader to the caller's transaction. */
  public constructor(db: TransactionDatabase<DatabaseSchema>) {
    this.db = db;
  }
  // #endregion

  // #region Methods
  /** Reads at most 100 exact task and comment pairs in the given organization. */
  public async findLive(
    organizationId: string,
    pairs: readonly CommentExcerptPair[],
  ): Promise<readonly CommentExcerptRecord[]> {
    if (pairs.length > 100) {
      throw new RangeError('At most 100 comment excerpts can be read at once.');
    }
    if (pairs.length === 0) return [];

    const rows = await this.db
      .select({
        taskId: taskComments.taskId,
        commentId: taskComments.id,
        body: taskComments.body,
      })
      .from(taskComments)
      .where(
        and(
          eq(taskComments.organizationId, organizationId),
          isNull(taskComments.deletedAt),
          isNotNull(taskComments.body),
          or(
            ...pairs.map((pair: CommentExcerptPair) =>
              and(eq(taskComments.taskId, pair.taskId), eq(taskComments.id, pair.commentId)),
            ),
          ),
        ),
      );
    return rows.flatMap((row) => (row.body === null ? [] : [{ ...row, body: row.body }]));
  }
  // #endregion
}
