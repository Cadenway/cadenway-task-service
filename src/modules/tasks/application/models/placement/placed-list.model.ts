/**
 * Interface PlacedList
 *
 * @description
 * A list of a space the actor sees, as the spaces module answers it.
 */
export interface PlacedList {
  // #region Properties
  /** Id of the list. */
  readonly id: string;

  /** The space of the list. */
  readonly spaceId: string;

  /** Name of the list. */
  readonly name: string;

  /** Icon of the list, if any. */
  readonly icon: string | null;

  /** Color of the list. */
  readonly color: string;

  /** The sprint dates and goal, `null` for a plain list. */
  readonly sprint: {
    readonly startDate: string;
    readonly endDate: string;
    readonly goal: string | null;
  } | null;

  /** When the list was created. */
  readonly createdAt: Date;

  /** Version of the list. */
  readonly version: number;
  // #endregion
}
