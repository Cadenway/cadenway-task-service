import type { SearchProjectionReader } from '../../../../ports/outbound/persistence/search-projection/search-projection-reader.port.js';
import type { SearchProjectionDecision } from '../../../../projections/search-projection/search-projection-decision.projection.js';
import {
  SEARCH_PROJECTION_RESPONSE_LIMIT,
  searchProjectionResponseBytes,
} from '../../../../services/search-projection/search-projection-response-size.service.js';
import type { ResolveTaskSearchProjectionsInput } from './resolve-task-search-projections.input.js';
import type { ResolveTaskSearchProjectionsOutput } from './resolve-task-search-projections.output.js';

/** Resolves all requested source identifiers against one current tenant snapshot. */
export class ResolveTaskSearchProjections {
  // #region Constructor
  /** Binds the source reader. */
  public constructor(private readonly reader: SearchProjectionReader) {}
  // #endregion

  // #region Methods
  /** Returns one current decision per canonical identifier in caller order. */
  public async execute(
    input: ResolveTaskSearchProjectionsInput,
  ): Promise<ResolveTaskSearchProjectionsOutput> {
    const ids = input.kind === 'task' ? input.ids : input.ids.map((id) => id.toLowerCase());
    if (new Set(ids).size !== ids.length) return { outcome: 'duplicate-ids' };

    const rows = await this.reader.resolve(input.organizationId, input.kind, ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const results = ids.map((id): SearchProjectionDecision => {
      const row = byId.get(id);
      return row?.projection == null
        ? { status: 'absent', id, version: row?.version ?? null }
        : { status: 'present', projection: row.projection };
    });
    return searchProjectionResponseBytes({ results }) <= SEARCH_PROJECTION_RESPONSE_LIMIT
      ? { outcome: 'resolved', results }
      : { outcome: 'batch-too-large' };
  }
  // #endregion
}
