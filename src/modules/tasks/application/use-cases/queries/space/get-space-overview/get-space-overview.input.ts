import type { PagePosition } from '../../../../models/page/page-position.model.js';

/**
 * Interface GetSpaceOverviewInput
 *
 * @description
 * A page of the lists of a space with the counts of their tasks.
 */
export interface GetSpaceOverviewInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The space. */
  readonly spaceId: string;

  /** The date of the caller, `YYYY-MM-DD`: a task is late when it is due before it. */
  readonly today: string;

  /** The last list of the previous page, `null` for the first page. */
  readonly after: PagePosition | null;

  /** The size of the page, 1 to 100. */
  readonly limit: number;
  // #endregion
}
