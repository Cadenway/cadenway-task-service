import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, count, eq, gt, or } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { TaskTemplateDraft } from '../../../../../application/models/template/task-template-draft.model.js';
import type { TaskTemplatePosition } from '../../../../../application/models/template/task-template-position.model.js';
import type { TaskTemplateRecord } from '../../../../../application/models/template/task-template-record.model.js';
import type { TaskTemplateRepository } from '../../../../../application/ports/outbound/persistence/template/task-template-repository.port.js';
import { taskTemplates } from '../../schemas/template/task-template.schema.js';

/** Converts a database row into the immutable template snapshot. */
function toRecord(row: typeof taskTemplates.$inferSelect): TaskTemplateRecord {
  return {
    organizationId: row.organizationId,
    id: row.id,
    spaceId: row.spaceId,
    name: row.name,
    title: row.title,
    description: row.description,
    priority: row.priority,
    labels: row.labels,
    checklist: row.checklist,
    subtasks: row.subtasks,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
  };
}

/** Tenant- and space-scoped task-template storage bound to the caller's transaction. */
export class DrizzleTaskTemplateRepository implements TaskTemplateRepository {
  // #region Constructor
  /** Binds the repository to the active transaction. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Creates a snapshot with its PostgreSQL-generated UUID and creation timestamp. */
  public async create(draft: TaskTemplateDraft): Promise<TaskTemplateRecord> {
    const [row] = await this.db.insert(taskTemplates).values(draft).returning();
    if (row === undefined) throw new Error('The task template was not inserted.');
    return toRecord(row);
  }

  /** Finds a template within its owning organization and space. */
  public async find(
    organizationId: string,
    spaceId: string,
    id: string,
  ): Promise<TaskTemplateRecord | null> {
    const [row] = await this.db
      .select()
      .from(taskTemplates)
      .where(
        and(
          eq(taskTemplates.organizationId, organizationId),
          eq(taskTemplates.spaceId, spaceId),
          eq(taskTemplates.id, id),
        ),
      )
      .limit(1);
    return row === undefined ? null : toRecord(row);
  }

  /** Reads the next bounded page in creation and UUID order. */
  public async list(
    organizationId: string,
    spaceId: string,
    after: TaskTemplatePosition | null,
    limit: number,
  ): Promise<readonly TaskTemplateRecord[]> {
    const position: SQL | undefined =
      after === null
        ? undefined
        : or(
            gt(taskTemplates.createdAt, new Date(after.createdAt)),
            and(
              eq(taskTemplates.createdAt, new Date(after.createdAt)),
              gt(taskTemplates.id, after.id),
            ),
          );
    const rows = await this.db
      .select()
      .from(taskTemplates)
      .where(
        and(
          eq(taskTemplates.organizationId, organizationId),
          eq(taskTemplates.spaceId, spaceId),
          position,
        ),
      )
      .orderBy(asc(taskTemplates.createdAt), asc(taskTemplates.id))
      .limit(limit);
    return rows.map(toRecord);
  }

  /** Counts the templates in one space while its owner holds the space write lock. */
  public async count(organizationId: string, spaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(taskTemplates)
      .where(
        and(eq(taskTemplates.organizationId, organizationId), eq(taskTemplates.spaceId, spaceId)),
      );
    return row?.count ?? 0;
  }

  /** Reads sources only, without bringing template content into the space transaction. */
  public async sourceListIds(
    organizationId: string,
    spaceId: string,
  ): Promise<readonly (string | null)[]> {
    const rows = await this.db
      .selectDistinct({ listId: taskTemplates.sourceListId })
      .from(taskTemplates)
      .where(
        and(eq(taskTemplates.organizationId, organizationId), eq(taskTemplates.spaceId, spaceId)),
      );
    return rows.map(({ listId }) => listId);
  }

  /** Deletes only the entry in the supplied tenant and space. */
  public async delete(organizationId: string, spaceId: string, id: string): Promise<void> {
    await this.db
      .delete(taskTemplates)
      .where(
        and(
          eq(taskTemplates.organizationId, organizationId),
          eq(taskTemplates.spaceId, spaceId),
          eq(taskTemplates.id, id),
        ),
      );
  }

  /** Clears the library during the parent space deletion. */
  public async deleteForSpace(organizationId: string, spaceId: string): Promise<void> {
    await this.db
      .delete(taskTemplates)
      .where(
        and(eq(taskTemplates.organizationId, organizationId), eq(taskTemplates.spaceId, spaceId)),
      );
  }
  // #endregion
}
