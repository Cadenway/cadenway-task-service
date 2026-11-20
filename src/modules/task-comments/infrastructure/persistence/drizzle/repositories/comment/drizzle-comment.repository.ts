import type { DatabaseSchema, TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, count, eq, gt, isNull, or } from 'drizzle-orm';

import type { CommentDraft } from '../../../../../application/models/comment/comment-draft.model.js';
import type { CommentPosition } from '../../../../../application/models/comment/comment-position.model.js';
import type { CommentRepository } from '../../../../../application/ports/outbound/persistence/comment/comment-repository.port.js';
import type { Comment } from '../../../../../domain/aggregates/comment/comment.aggregate.js';
import { validateCommentText } from '../../../../../domain/policies/comment/comment-text.policy.js';
import { toComment } from '../../mappers/comment/task-comment.mapper.js';
import { taskComments } from '../../schemas/comment/task-comment.schema.js';

/** Drizzle comment storage in the caller's tenant transaction. */
export class DrizzleCommentRepository implements CommentRepository {
  // #region Properties
  /** Transaction-scoped database. */
  private readonly db: TransactionDatabase<DatabaseSchema>;
  // #endregion

  // #region Constructor
  /** Binds this repository to the caller's transaction. */
  public constructor(db: TransactionDatabase<DatabaseSchema>) {
    this.db = db;
  }
  // #endregion

  // #region Methods
  /** Inserts a comment with PostgreSQL-generated identity and timestamps. */
  public async insert(draft: CommentDraft): Promise<Comment> {
    validateCommentText(draft.body, draft.mentions);
    const [row] = await this.db.insert(taskComments).values(draft).returning();
    if (row === undefined) throw new Error('The comment insert returned no row.');
    return toComment(row);
  }

  /** Reads one task comment, optionally including a tombstone. */
  public async find(
    organizationId: string,
    taskId: string,
    id: string,
    includeDeleted: boolean,
  ): Promise<Comment | null> {
    const [row] = await this.db
      .select()
      .from(taskComments)
      .where(
        and(
          eq(taskComments.organizationId, organizationId),
          eq(taskComments.taskId, taskId),
          eq(taskComments.id, id),
          includeDeleted ? undefined : isNull(taskComments.deletedAt),
        ),
      )
      .limit(1);
    return row === undefined ? null : toComment(row);
  }

  /** Reads a bounded page of live comments, oldest first. */
  public async list(
    organizationId: string,
    taskId: string,
    after: CommentPosition | null,
    limit: number,
  ): Promise<readonly Comment[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 101)
      throw new RangeError('Invalid comment page limit.');
    const rows = await this.db
      .select()
      .from(taskComments)
      .where(
        and(
          eq(taskComments.organizationId, organizationId),
          eq(taskComments.taskId, taskId),
          isNull(taskComments.deletedAt),
          after === null
            ? undefined
            : or(
                gt(taskComments.createdAt, after.createdAt),
                and(eq(taskComments.createdAt, after.createdAt), gt(taskComments.id, after.id)),
              ),
        ),
      )
      .orderBy(asc(taskComments.createdAt), asc(taskComments.id))
      .limit(limit);
    return rows.map(toComment);
  }

  /** Counts only live comments on the task. */
  public async count(organizationId: string, taskId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(taskComments)
      .where(
        and(
          eq(taskComments.organizationId, organizationId),
          eq(taskComments.taskId, taskId),
          isNull(taskComments.deletedAt),
        ),
      );
    return row?.total ?? 0;
  }

  /** Saves the next version if the caller's previously read version is still current. */
  public async update(comment: Comment, expectedVersion: number): Promise<boolean> {
    const state = comment.snapshot;
    if (state.version !== expectedVersion + 1)
      throw new Error('Comment version must advance once.');
    const rows = await this.db
      .update(taskComments)
      .set({
        body: state.body,
        mentions: state.mentions,
        editedAt: state.editedAt,
        deletedAt: state.deletedAt,
        version: state.version,
      })
      .where(
        and(
          eq(taskComments.organizationId, state.organizationId),
          eq(taskComments.taskId, state.taskId),
          eq(taskComments.id, state.id),
          eq(taskComments.version, expectedVersion),
          isNull(taskComments.deletedAt),
        ),
      )
      .returning({ id: taskComments.id });
    return rows.length === 1;
  }
  // #endregion
}
