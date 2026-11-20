import type { SearchProjectionCursor } from '../../../../ports/outbound/pagination/search-projection/search-projection-cursor.port.js';
import type { SearchProjectionReader } from '../../../../ports/outbound/persistence/search-projection/search-projection-reader.port.js';
import {
  SEARCH_PROJECTION_RESPONSE_LIMIT,
  searchProjectionResponseBytes,
} from '../../../../services/search-projection/search-projection-response-size.service.js';
import type { ListTaskSearchProjectionsInput } from './list-task-search-projections.input.js';
import type { ListTaskSearchProjectionsOutput } from './list-task-search-projections.output.js';

/** Produces a bounded page of active records from one tenant snapshot. */
export class ListTaskSearchProjections {
  // #region Constructor
  /** Binds the source reader and the export cursor codec. */
  public constructor(
    private readonly reader: SearchProjectionReader,
    private readonly cursors: SearchProjectionCursor | null,
  ) {}
  // #endregion

  // #region Methods
  /** Emits the largest fitting prefix and advances only past its last emitted row. */
  public async execute(
    input: ListTaskSearchProjectionsInput,
  ): Promise<ListTaskSearchProjectionsOutput> {
    if (this.cursors === null) return { outcome: 'unavailable' };
    const { organizationId, scope, limit } = input;
    const bounds =
      input.cursor === null ? null : this.cursors.decode(organizationId, scope, input.cursor);
    if (input.cursor !== null && bounds === null) return { outcome: 'invalid-cursor' };

    const { upperId, entries } = await this.reader.page(organizationId, scope, bounds, limit);
    if (entries.length === 0) return { outcome: 'page', items: [], nextCursor: null };
    if (upperId === null) return { outcome: 'unavailable' };

    const selected = entries.slice(0, limit);
    const costs = selected.map(({ projection }) => searchProjectionResponseBytes(projection));
    let itemsBytes = costs.reduce((sum, cost) => sum + cost, 0);
    const envelopeBytes = searchProjectionResponseBytes({ items: [], nextCursor: null }) - 4;

    for (let length = selected.length; length > 0; length -= 1) {
      const last = selected[length - 1];
      const cost = costs[length - 1];
      if (last === undefined || cost === undefined) return { outcome: 'unavailable' };
      const nextCursor =
        length < entries.length
          ? this.cursors.encode(organizationId, scope, { afterId: last.rowId, upperId })
          : null;
      const bytes =
        envelopeBytes + itemsBytes + length - 1 + searchProjectionResponseBytes(nextCursor);
      if (bytes <= SEARCH_PROJECTION_RESPONSE_LIMIT) {
        return {
          outcome: 'page',
          items: selected.slice(0, length).map(({ projection }) => projection),
          nextCursor,
        };
      }
      itemsBytes -= cost;
    }
    return { outcome: 'unavailable' };
  }
  // #endregion
}
