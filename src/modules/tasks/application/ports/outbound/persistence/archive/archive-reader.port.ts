import type { ArchivePosition } from '../../../../models/archive/archive-position.model.js';
import type { ArchivedRootView } from '../../../../projections/archive/archived-root.projection.js';

/**
 * Interface ArchiveReader
 *
 * @description
 * The reads of the page "Archives" ("Archives", tabs "Listes" and "Tâches" of
 * `openapi/public/archives.yaml`): the roots of the archives of some lists, their members and the
 * live top-level tasks of archived lists. Every method filters on the organization, takes no lock
 * and sends a bounded number of statements whatever the number of rows.
 */
export interface ArchiveReader {
  // #region Methods
  /**
   * Method pageOfRoots
   *
   * @description
   * Reads a page of the roots of the archives of some lists, the most recently archived first
   * (`archived_at desc, id desc`), after a position, summarized as a page of tasks is (the subtask
   * counts are those of the subtasks archived with each root).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists the actor has a role on, archived ones included.
   * @param {ArchivePosition | null} after - The last root of the previous page, `null` for the
   * first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ArchivedRootView[]>} The roots, in the order of the page.
   */
  pageOfRoots(
    organizationId: string,
    listIds: readonly string[],
    after: ArchivePosition | null,
    limit: number,
  ): Promise<readonly ArchivedRootView[]>;

  /**
   * Method countRoots
   *
   * @description
   * Counts the roots of the archives of some lists.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @returns {Promise<number>} The count.
   */
  countRoots(organizationId: string, listIds: readonly string[]): Promise<number>;

  /**
   * Method memberCounts
   *
   * @description
   * Counts the members of archives, their roots included, in one grouped statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} rootIds - The roots of the archives.
   * @returns {Promise<ReadonlyMap<string, number>>} The count of members by root id.
   */
  memberCounts(
    organizationId: string,
    rootIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>>;

  /**
   * Method liveRootCounts
   *
   * @description
   * Counts the live top-level tasks of lists in one grouped statement: the `taskCount` of an
   * archived list ("Produit · 14 tâches").
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @returns {Promise<ReadonlyMap<string, number>>} The count by list id; a list without one is
   * left out.
   */
  liveRootCounts(
    organizationId: string,
    listIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>>;
  // #endregion
}
