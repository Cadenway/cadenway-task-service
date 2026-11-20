import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import type { CustomFieldRepository } from '../../../../../application/ports/outbound/persistence/custom-field/custom-field-repository.port.js';
import type { CustomFieldDefinition } from '../../../../../domain/value-objects/custom-field/custom-field-definition.value-object.js';
import type { CustomFieldValueChange } from '../../../../../domain/value-objects/custom-field/custom-field-value-change.value-object.js';
import { spaceCustomFields } from '../../schemas/custom-field/space-custom-field.schema.js';
import { taskCustomFieldValues } from '../../schemas/custom-field/task-custom-field-value.schema.js';
import { tasks } from '../../schemas/task/task.schema.js';

/** One sparse value belonging to a requested task. */
interface StoredCustomFieldValue {
  // #region Properties
  /** Task that owns the value. */
  readonly taskId: string;

  /** Definition that identifies the value. */
  readonly fieldId: string;

  /** Stored number or text. */
  readonly value: number | string;
  // #endregion
}

/** Persists definitions and sparse task values in the caller's tenant transaction. */
export class DrizzleCustomFieldRepository implements CustomFieldRepository {
  // #region Constructor
  /** Binds every operation to the caller's transaction. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Allocates the field ID from the database, as other stored resources do. */
  public async allocateId(): Promise<string> {
    const result = await this.db.execute<{ id: string }>(sql`select uuidv7()::text as id`);
    const id = result.rows[0]?.id;
    if (id === undefined) throw new Error('The database did not allocate a custom field ID.');
    return id;
  }

  /** Reads the complete active set, which the domain bounds to 30 definitions per space. */
  public async activeDefinitions(
    organizationId: string,
    spaceId: string,
  ): Promise<readonly CustomFieldDefinition[]> {
    return this.db
      .select({
        id: spaceCustomFields.id,
        spaceId: spaceCustomFields.spaceId,
        name: spaceCustomFields.name,
        type: spaceCustomFields.type,
        position: spaceCustomFields.position,
        sprintPoints: spaceCustomFields.sprintPoints,
        version: spaceCustomFields.version,
      })
      .from(spaceCustomFields)
      .where(
        and(
          eq(spaceCustomFields.organizationId, organizationId),
          eq(spaceCustomFields.spaceId, spaceId),
          isNull(spaceCustomFields.retiredAt),
        ),
      )
      .orderBy(asc(spaceCustomFields.position), asc(spaceCustomFields.id))
      .limit(31);
  }

  /** Inserts a new definition after the application locks and validates its space. */
  public async create(organizationId: string, definition: CustomFieldDefinition): Promise<void> {
    await this.db.insert(spaceCustomFields).values({ organizationId, ...definition });
  }

  /** Saves changed rows while preserving the partial unique sprint designation constraint. */
  public async saveDefinitions(
    organizationId: string,
    spaceId: string,
    definitions: readonly CustomFieldDefinition[],
  ): Promise<void> {
    if (definitions.length === 0) return;
    if (definitions.length > 30) throw new Error('Too many custom field definitions.');
    const cleared = definitions.filter((definition) => !definition.sprintPoints);
    const designated = definitions.filter((definition) => definition.sprintPoints);
    for (const batch of [cleared, designated]) {
      if (batch.length === 0) continue;
      const values = batch.map(
        (definition) => sql`(
        ${definition.id}::uuid, ${definition.name}::text, ${definition.position}::integer,
        ${definition.sprintPoints}::boolean, ${definition.version}::integer
      )`,
      );
      const result = await this.db.execute(sql`
        update space_custom_fields as fields
           set name = changes.name, position = changes.position,
               sprint_points = changes.sprint_points, version = changes.version,
               updated_at = clock_timestamp()
          from (values ${sql.join(values, sql`, `)}) as changes(id, name, position, sprint_points, version)
         where fields.organization_id = ${organizationId}::uuid
           and fields.space_id = ${spaceId}::uuid and fields.id = changes.id
           and fields.retired_at is null
        returning fields.id
      `);
      if (result.rows.length !== batch.length) {
        throw new Error('A locked custom field definition was not found.');
      }
    }
  }

  /** Retires a definition and applies the surviving positions in the same transaction. */
  public async retire(
    organizationId: string,
    spaceId: string,
    retired: CustomFieldDefinition,
    updated: readonly CustomFieldDefinition[],
    retiredAt: Date,
  ): Promise<void> {
    const rows = await this.db
      .update(spaceCustomFields)
      .set({ retiredAt, updatedAt: retiredAt, sprintPoints: false, version: retired.version })
      .where(
        and(
          eq(spaceCustomFields.organizationId, organizationId),
          eq(spaceCustomFields.spaceId, spaceId),
          eq(spaceCustomFields.id, retired.id),
          isNull(spaceCustomFields.retiredAt),
        ),
      )
      .returning({ id: spaceCustomFields.id });
    if (rows.length !== 1) throw new Error('A locked custom field definition was not found.');
    await this.saveDefinitions(organizationId, spaceId, updated);
  }

  /** Checks whether a numeric field already contains a negative value. */
  public async hasNegativeValues(organizationId: string, fieldId: string): Promise<boolean> {
    const rows = await this.db
      .select({ taskId: taskCustomFieldValues.taskId })
      .from(taskCustomFieldValues)
      .where(
        and(
          eq(taskCustomFieldValues.organizationId, organizationId),
          eq(taskCustomFieldValues.fieldId, fieldId),
          lt(taskCustomFieldValues.numberValue, 0),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** Loads active values for a bounded page of tasks in a single indexed query. */
  public async valuesForTasks(
    organizationId: string,
    spaceId: string,
    taskIds: readonly string[],
  ): Promise<readonly StoredCustomFieldValue[]> {
    if (taskIds.length === 0) return [];
    if (taskIds.length > 500) throw new Error('Too many tasks in a custom field page.');
    const rows = await this.db
      .select({
        taskId: taskCustomFieldValues.taskId,
        fieldId: taskCustomFieldValues.fieldId,
        numberValue: taskCustomFieldValues.numberValue,
        textValue: taskCustomFieldValues.textValue,
      })
      .from(taskCustomFieldValues)
      .innerJoin(
        spaceCustomFields,
        and(
          eq(spaceCustomFields.organizationId, taskCustomFieldValues.organizationId),
          eq(spaceCustomFields.id, taskCustomFieldValues.fieldId),
        ),
      )
      .where(
        and(
          eq(taskCustomFieldValues.organizationId, organizationId),
          inArray(taskCustomFieldValues.taskId, [...taskIds]),
          eq(spaceCustomFields.organizationId, organizationId),
          eq(spaceCustomFields.spaceId, spaceId),
          isNull(spaceCustomFields.retiredAt),
        ),
      );
    return rows.map((row) => {
      const value = row.numberValue ?? row.textValue;
      if (value === null) throw new Error('A custom field row contains no value.');
      return { taskId: row.taskId, fieldId: row.fieldId, value };
    });
  }

  /** Loads values only for the task placements authorized in the original task page. */
  public async valuesForTaskPage(
    organizationId: string,
    authorizedTasks: readonly {
      readonly taskId: string;
      readonly spaceId: string;
      readonly listId: string;
    }[],
  ): Promise<readonly StoredCustomFieldValue[]> {
    if (authorizedTasks.length === 0) return [];
    if (authorizedTasks.length > 500) throw new Error('Too many tasks in a custom field page.');
    const taskIds = authorizedTasks.map((task) => task.taskId);
    const spaceIds = authorizedTasks.map((task) => task.spaceId);
    const listIds = authorizedTasks.map((task) => task.listId);
    const rows = await this.db
      .select({
        taskId: taskCustomFieldValues.taskId,
        fieldId: taskCustomFieldValues.fieldId,
        numberValue: taskCustomFieldValues.numberValue,
        textValue: taskCustomFieldValues.textValue,
      })
      .from(taskCustomFieldValues)
      .innerJoin(
        tasks,
        and(
          eq(tasks.organizationId, taskCustomFieldValues.organizationId),
          eq(tasks.id, taskCustomFieldValues.taskId),
        ),
      )
      .innerJoin(
        spaceCustomFields,
        and(
          eq(spaceCustomFields.organizationId, taskCustomFieldValues.organizationId),
          eq(spaceCustomFields.id, taskCustomFieldValues.fieldId),
          eq(spaceCustomFields.spaceId, tasks.spaceId),
        ),
      )
      .where(
        and(
          eq(taskCustomFieldValues.organizationId, organizationId),
          eq(tasks.organizationId, organizationId),
          eq(spaceCustomFields.organizationId, organizationId),
          sql`${taskCustomFieldValues.taskId} = any(${sql.param(taskIds)}::uuid[])`,
          sql`exists (
            select 1
              from unnest(${sql.param(taskIds)}::uuid[], ${sql.param(spaceIds)}::uuid[], ${sql.param(listIds)}::uuid[])
                   as authorized(task_id, space_id, list_id)
             where authorized.task_id = ${taskCustomFieldValues.taskId}
               and authorized.space_id = ${spaceCustomFields.spaceId}
               and authorized.list_id = ${tasks.listId}
          )`,
          isNull(spaceCustomFields.retiredAt),
        ),
      );
    return rows.map((row) => {
      const value = row.numberValue ?? row.textValue;
      if (value === null) throw new Error('A custom field row contains no value.');
      return { taskId: row.taskId, fieldId: row.fieldId, value };
    });
  }

  /** Applies a bounded, validated patch while holding the task and space locks. */
  public async applyValues(
    organizationId: string,
    taskId: string,
    changes: readonly CustomFieldValueChange[],
  ): Promise<void> {
    if (changes.length > 30) throw new Error('Too many custom field values.');
    const removed = changes
      .filter((change) => change.value === null)
      .map((change) => change.fieldId);
    if (removed.length > 0) {
      await this.db
        .delete(taskCustomFieldValues)
        .where(
          and(
            eq(taskCustomFieldValues.organizationId, organizationId),
            eq(taskCustomFieldValues.taskId, taskId),
            inArray(taskCustomFieldValues.fieldId, removed),
          ),
        );
    }
    const values = changes
      .filter((change) => change.value !== null)
      .map((change) => ({
        organizationId,
        taskId,
        fieldId: change.fieldId,
        numberValue: typeof change.value === 'number' ? change.value : null,
        textValue: typeof change.value === 'string' ? change.value : null,
      }));
    if (values.length > 0) {
      await this.db
        .insert(taskCustomFieldValues)
        .values(values)
        .onConflictDoUpdate({
          target: [
            taskCustomFieldValues.organizationId,
            taskCustomFieldValues.taskId,
            taskCustomFieldValues.fieldId,
          ],
          set: { numberValue: sql`excluded.number_value`, textValue: sql`excluded.text_value` },
        });
    }
  }

  /** Clears a bounded set of moved tasks when their current space changes. */
  public async clearTasks(organizationId: string, taskIds: readonly string[]): Promise<void> {
    if (taskIds.length === 0) return;
    if (taskIds.length > 500) throw new Error('Too many tasks in a custom field cleanup.');
    await this.db
      .delete(taskCustomFieldValues)
      .where(
        and(
          eq(taskCustomFieldValues.organizationId, organizationId),
          inArray(taskCustomFieldValues.taskId, [...taskIds]),
        ),
      );
  }
  // #endregion
}
