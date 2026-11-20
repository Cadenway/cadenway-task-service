import type { SearchAccessPlacement } from '../../../../models/search-access/search-access-placement.model.js';
import type { SearchAccessViewer } from '../../../../models/search-access/search-access-viewer.model.js';
import type { SearchAccessUnitOfWork } from '../../../../ports/outbound/transactions/search-access/search-access-unit-of-work.port.js';
import type { ResolveTaskSearchAccessInput } from './resolve-task-search-access.input.js';
import type { ResolveTaskSearchAccessOutput } from './resolve-task-search-access.output.js';

const kinds = ['task', 'list', 'space'] as const;

/** Proves visibility of Search candidates under one current membership and tenant snapshot. */
export class ResolveTaskSearchAccess {
  // #region Constructor
  /** Binds the transaction that shares current membership, placement and authorization. */
  public constructor(private readonly unitOfWork: SearchAccessUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Returns null when the local membership disagrees with Organization's current evidence. */
  public async execute(
    input: ResolveTaskSearchAccessInput,
  ): Promise<ResolveTaskSearchAccessOutput | null> {
    return this.unitOfWork.read(async (store) => {
      const member = await store.membership({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
      });
      if (
        member?.version !== input.membership.version ||
        member.memberId.toLowerCase() !== input.membership.memberId.toLowerCase() ||
        member.role !== input.membership.role
      ) {
        return null;
      }
      if (input.candidates.length === 0) return { results: [] };

      const viewer: SearchAccessViewer = {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        role: member.role,
      };
      const idsByKind: Record<SearchAccessPlacement['kind'], string[]> = {
        task: [],
        list: [],
        space: [],
      };
      for (const { kind, id } of input.candidates) idsByKind[kind].push(id);

      const placements = new Map<string, SearchAccessPlacement>();
      const listIds = new Set<string>();
      const spaceIds: string[] = [];
      for (const kind of kinds) {
        const ids = idsByKind[kind];
        if (ids.length === 0) continue;
        for (const row of await store.placements(input.organizationId, kind, ids)) {
          placements.set(`${row.kind}:${row.id}`, row);
          if (row.kind === 'space') {
            spaceIds.push(row.id);
          } else {
            listIds.add(row.kind === 'task' ? row.listId : row.id);
          }
        }
      }

      const visibleLists = new Set(
        listIds.size === 0 ? [] : await store.visibleLists(viewer, [...listIds]),
      );
      const visibleSpaces = new Set(
        spaceIds.length === 0 ? [] : await store.visibleSpaces(viewer, spaceIds),
      );
      const directSpaces = new Set(
        visibleSpaces.size === 0 ? [] : await store.directSpaces(viewer, [...visibleSpaces]),
      );

      const results: ResolveTaskSearchAccessOutput['results'][number][] = [];
      for (const { kind, id } of input.candidates) {
        const row = placements.get(`${kind}:${id}`);
        if (row === undefined) continue;
        switch (row.kind) {
          case 'task':
            if (visibleLists.has(row.listId)) results.push(row);
            break;
          case 'list':
            if (visibleLists.has(row.id)) results.push(row);
            break;
          case 'space':
            if (visibleSpaces.has(row.id))
              results.push({ ...row, directSpace: directSpaces.has(row.id) });
            break;
        }
      }
      return { results };
    });
  }
  // #endregion
}
