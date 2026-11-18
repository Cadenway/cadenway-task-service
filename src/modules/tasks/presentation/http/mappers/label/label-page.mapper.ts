import type { LabelPage as LabelPageBody } from '@cadenway/contracts/types/internal/task-service';

import type { LabelPage } from '../../../../application/projections/label/label-page.projection.js';
import type { LabelView } from '../../../../application/projections/label/label-view.projection.js';

/**
 * Function toLabelPage
 *
 * @description
 * Maps one page of the labels of the tasks the actor sees to the `LabelPage` of the contract: each
 * label once, by the spelling that comes first, with the cursor of the next page, `null` on the
 * last one.
 *
 * @param {LabelPage} page - The page.
 * @param {string | null} nextCursor - The cursor of the next page, built with the search of the
 * request.
 * @returns {LabelPageBody} The page of the contract.
 */
export function toLabelPage(page: LabelPage, nextCursor: string | null): LabelPageBody {
  return { items: page.items.map((label: LabelView) => ({ name: label.name })), nextCursor };
}
