import type { LabelPosition } from '../../../../models/label/label-position.model.js';
import type { ListedLabel } from '../../../../models/label/listed-label.model.js';

/**
 * Interface LabelReader
 *
 * @description
 * The labels of the tasks, without a lock. Every method filters on the organization.
 */
export interface LabelReader {
  // #region Methods
  /**
   * Method pageOfLabels
   *
   * @description
   * Reads a page of the labels of the tasks in some lists, any level, each label once whatever its
   * case (one per `labelKey`), by folded name then key. The name is the spelling that comes first
   * among the tasks of these lists, so that a list the actor has no role on leaks no spelling.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @param {string | null} search - The text to find in the label, without regard to case or
   * accents; `null` for every label.
   * @param {LabelPosition | null} after - The last label of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ListedLabel[]>} The labels, each with the position after it.
   */
  pageOfLabels(
    organizationId: string,
    listIds: readonly string[],
    search: string | null,
    after: LabelPosition | null,
    limit: number,
  ): Promise<readonly ListedLabel[]>;
  // #endregion
}
