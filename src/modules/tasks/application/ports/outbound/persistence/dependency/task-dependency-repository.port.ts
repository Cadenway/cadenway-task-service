import type { DependencyCandidateQuery } from '../../../../models/dependency/dependency-candidate-query.model.js';
import type { DependencyEdge } from '../../../../models/dependency/dependency-edge.model.js';
import type { DependencyGraphCheck } from '../../../../models/dependency/dependency-graph-check.model.js';
import type { PagePosition } from '../../../../models/page/page-position.model.js';
import type { DependencyCandidatePage } from '../../../../projections/dependency/dependency-candidate-page.projection.js';
import type { DependencyPageView } from '../../../../projections/dependency/dependency-page.projection.js';
import type { DependencyView } from '../../../../projections/dependency/dependency.projection.js';

/** The tenant dependency graph and its visibility-filtered projections. */
export interface TaskDependencyRepository {
  // #region Methods
  /** Serializes explicit graph mutations until the current transaction ends. */
  lockGraph(organizationId: string): Promise<void>;

  /** Finds the edge only when it belongs to the tenant and touches the anchor. */
  findEdge(
    organizationId: string,
    anchorId: string,
    dependencyId: string,
  ): Promise<DependencyEdge | null>;

  /** Checks duplicate, cycle and incident capacity against all retained edges. */
  inspect(
    organizationId: string,
    blockerId: string,
    blockedId: string,
  ): Promise<DependencyGraphCheck>;

  /** Stores the oriented edge after its invariants were checked under the graph lock. */
  insert(organizationId: string, blockerId: string, blockedId: string): Promise<DependencyEdge>;

  /** Removes the edge after the caller locked and authorized both endpoints. */
  remove(organizationId: string, edge: DependencyEdge): Promise<void>;

  /** Reads an edge whose counterpart is currently live and visible. */
  get(
    organizationId: string,
    anchorId: string,
    dependencyId: string,
    visibleListIds: readonly string[],
  ): Promise<DependencyView | null>;

  /** Pages the visible edges of an anchor by creation time and id. */
  page(
    organizationId: string,
    anchorId: string,
    visibleListIds: readonly string[],
    after: PagePosition | null,
    limit: number,
  ): Promise<DependencyPageView>;

  /** Lists editable tasks that can currently be candidates in the selected direction. */
  candidates(query: DependencyCandidateQuery): Promise<DependencyCandidatePage>;
  // #endregion
}
