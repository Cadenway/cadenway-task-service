/**
 * Interface GroupPosition
 *
 * @description
 * Where a page of groups starts: after the group `value`, which had `count` tasks on the previous
 * page. A status or a priority is found by its place in the contract order, `value` alone; an
 * assignee group by `count` then `value`, so that a count that changed between two pages does not
 * repeat or skip a group. The presentation layer encodes it in the opaque cursor.
 */
export interface GroupPosition {
  // #region Properties
  /** The status, the priority, the account id or `none` of the last group of the previous page. */
  readonly value: string;

  /** Its count on the previous page. */
  readonly count: number;
  // #endregion
}
