import { requireOrganizationId } from '@cadenway/nest-common';
import type { TenantTransactionRunner } from '@cadenway/nest-common/database';
import { sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { SearchProjectionBounds } from '../../../../../application/models/search-projection/search-projection-bounds.model.js';
import type { SearchProjectionKind } from '../../../../../application/models/search-projection/search-projection-kind.model.js';
import type { SearchProjectionScope } from '../../../../../application/models/search-projection/search-projection-scope.model.js';
import type { SearchProjectionReader } from '../../../../../application/ports/outbound/persistence/search-projection/search-projection-reader.port.js';
import type { SearchProjectionEntry } from '../../../../../application/projections/search-projection/search-projection-entry.projection.js';
import type { SearchProjectionRow } from '../../../../../application/projections/search-projection/search-projection-row.projection.js';
import type { SearchProjectionSlice } from '../../../../../application/projections/search-projection/search-projection-slice.projection.js';
import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { liveTask } from '../../mappers/task/live-task.mapper.js';
import { tasks } from '../../schemas/task/task.schema.js';

type RawProjectionRow = Record<string, unknown> & {
  readonly rowId: string;
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly active: boolean;
  readonly status: StatusKey | null;
  readonly listId: string | null;
  readonly spaceId: string | null;
};

interface Source {
  // #region Properties
  /** Owned tables and ancestry needed by this kind. */
  readonly from: SQL;
  readonly rowId: SQL;
  readonly tenant: SQL;
  readonly id: SQL;
  readonly content: SQL;
  readonly active: SQL;
  // #endregion
}

const task = alias(tasks, 't');
const listActive = sql`l.id is not null and l.archived_at is null and l.deleted_at is null`;
// Awaiting an owner restricts user access proof; deletion defines the source lifecycle here.
const spaceActive = sql`s.id is not null and s.deleted_at is null`;

// Read-only joins to the same service's placement tables keep placement and lifecycle in the
// same snapshot as the source row. Both joins bind the same tenant, including for tombstone reads.
const sources: Readonly<Record<SearchProjectionKind, Source>> = {
  task: {
    from: sql`from ${tasks} t
      left join lists l on l.organization_id = ${task.organizationId} and l.id = ${task.listId}
        and l.space_id = ${task.spaceId}
      left join spaces s on s.organization_id = l.organization_id and s.id = l.space_id`,
    tenant: sql`${task.organizationId}`,
    rowId: sql`${task.id}`,
    id: sql`(${task.keyPrefix} || '-' || ${task.keyNumber}::text)`,
    content: sql`${task.version} as version, ${task.name} as name, ${task.status} as status,
      ${task.listId} as "listId", ${task.spaceId} as "spaceId"`,
    active: sql`(${liveTask(task)} and ${listActive} and ${spaceActive})`,
  },
  list: {
    from: sql`from lists l
      left join spaces s on s.organization_id = l.organization_id and s.id = l.space_id`,
    tenant: sql`l.organization_id`,
    rowId: sql`l.id`,
    id: sql`l.id`,
    content: sql`l.version, l.name, null as status, null as "listId", l.space_id as "spaceId"`,
    active: sql`(${listActive} and ${spaceActive})`,
  },
  space: {
    from: sql`from spaces s`,
    tenant: sql`s.organization_id`,
    rowId: sql`s.id`,
    id: sql`s.id`,
    content: sql`s.version, s.name, null as status, null as "listId", null as "spaceId"`,
    active: sql`(${spaceActive})`,
  },
};

function sourceRows(source: Source): SQL {
  return sql`select ${source.rowId} as "rowId", ${source.id} as id, ${source.content},
      ${source.active} as active
    ${source.from}`;
}

function placementFilter(scope: SearchProjectionScope): SQL {
  const conditions: SQL[] = [];
  if (scope.spaceId !== null) conditions.push(sql`l.space_id = ${scope.spaceId}::uuid`);
  if (scope.listId !== null) conditions.push(sql`l.id = ${scope.listId}::uuid`);
  return conditions.length === 0 ? sql.empty() : sql`and ${sql.join(conditions, sql` and `)}`;
}

function selectedIds(kind: SearchProjectionKind, source: Source, ids: readonly string[]): SQL {
  if (kind === 'task') {
    const pairs = ids.map((id) => {
      const { prefix, number } = TaskKey.parse(id);
      return sql`(${prefix}::text, ${number}::integer)`;
    });
    return sql`(${task.keyPrefix}, ${task.keyNumber}) in (${sql.join(pairs, sql`, `)})`;
  }
  const keys = ids.map((id) => sql`${id}::uuid`);
  return sql`${source.rowId} in (${sql.join(keys, sql`, `)})`;
}

function toProjectionRow(kind: SearchProjectionKind, row: RawProjectionRow): SearchProjectionRow {
  const { rowId, id, version, name } = row;
  const identity = { rowId, id, version };
  if (!row.active) return { ...identity, projection: null };

  const base = { id, version, name, lifecycle: 'active' } as const;
  if (kind === 'space') return { ...identity, projection: { ...base, kind } };
  if (row.spaceId === null) throw new Error('Active projection lacks a space.');
  if (kind === 'list') return { ...identity, projection: { ...base, kind, spaceId: row.spaceId } };
  if (row.listId === null || row.status === null)
    throw new Error('Active task projection is incomplete.');
  return {
    ...identity,
    projection: { ...base, kind, status: row.status, listId: row.listId, spaceId: row.spaceId },
  };
}

function assertTenant(organizationId: string): void {
  if (requireOrganizationId().toLowerCase() !== organizationId.toLowerCase()) {
    throw new Error('Projection read does not match its tenant context.');
  }
}

/** Reads the authoritative Task projection in the configured organization snapshot. */
export class DrizzleSearchProjectionReader implements SearchProjectionReader {
  // #region Constructor
  /** Binds the shared transaction runner. */
  public constructor(private readonly runner: TenantTransactionRunner) {}
  // #endregion

  // #region Methods
  /** Pages over live rows by immutable ID, joining the caller's snapshot if present. */
  public async page(
    organizationId: string,
    scope: SearchProjectionScope,
    bounds: SearchProjectionBounds | null,
    limit: number,
  ): Promise<SearchProjectionSlice> {
    assertTenant(organizationId);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('Projection page limit must be between one and 100.');
    }
    const source = sources[scope.kind];
    const filters = sql`where ${source.tenant} = ${organizationId}::uuid
      and ${source.active} ${placementFilter(scope)}`;

    return this.runner.run(
      async ({ db }) => {
        let upperId = bounds?.upperId;
        if (upperId === undefined) {
          const fence = await db.execute<{ rowId: string }>(sql`
            select ${source.rowId} as "rowId" ${source.from} ${filters}
            order by ${source.rowId} desc limit 1
          `);
          upperId = fence.rows[0]?.rowId;
        }
        if (upperId === undefined) return { upperId: null, entries: [] };

        const after =
          bounds === null ? sql.empty() : sql`and ${source.rowId} > ${bounds.afterId}::uuid`;
        const result = await db.execute<RawProjectionRow>(sql`
          ${sourceRows(source)} ${filters} ${after}
            and ${source.rowId} <= ${upperId}::uuid
          order by ${source.rowId} asc limit ${limit + 1}
        `);
        const entries = result.rows.map((raw): SearchProjectionEntry => {
          const { rowId, projection } = toProjectionRow(scope.kind, raw);
          if (projection === null) throw new Error('Projection page included an inactive row.');
          return { rowId, projection };
        });
        return { upperId, entries };
      },
      { readOnly: true, isolationLevel: 'repeatable read' },
    );
  }

  /** Keeps source versions for known inactive records and omits missing or foreign records. */
  public async resolve(
    organizationId: string,
    kind: SearchProjectionKind,
    ids: readonly string[],
  ): Promise<readonly SearchProjectionRow[]> {
    assertTenant(organizationId);
    if (ids.length > 100)
      throw new RangeError('Projection lookup accepts at most 100 identifiers.');
    if (ids.length === 0) return [];
    const source = sources[kind];
    return this.runner.run(
      async ({ db }) => {
        const result = await db.execute<RawProjectionRow>(sql`
          ${sourceRows(source)}
          where ${source.tenant} = ${organizationId}::uuid and ${selectedIds(kind, source, ids)}
        `);
        return result.rows.map((row) => toProjectionRow(kind, row));
      },
      { readOnly: true, isolationLevel: 'repeatable read' },
    );
  }
  // #endregion
}
