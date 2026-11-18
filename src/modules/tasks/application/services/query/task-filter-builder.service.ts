import { labelKey } from '../../../domain/value-objects/task/label-name.value-object.js';
import type { TaskFilter } from '../../models/query/task-filter.model.js';
import type { TaskFilterInput } from '../../models/query/task-filter-input.model.js';

/**
 * Class TaskFilterBuilder
 *
 * @description
 * Turns the filters of the route into what the repository compares (`TaskFilterInput` into
 * `TaskFilter`): `me` becomes the actor, `none` a flag, the labels their `labelKey` (so that
 * "without regard to case", `openapi/internal/task-service.yaml:1343`, is the identity of a label
 * and accents stay significant), and every list loses its duplicates. A label that is blank once
 * trimmed becomes the empty key, which no label has, so it matches nothing. The search text is
 * kept as sent.
 */
export class TaskFilterBuilder {
  // #region Methods
  /**
   * Method build
   *
   * @description
   * Resolves the filters for an actor.
   *
   * @param {TaskFilterInput} input - The filters of the route.
   * @param {string} actorUserId - The account `me` stands for.
   * @returns {TaskFilter} The filter.
   */
  public build(input: TaskFilterInput, actorUserId: string): TaskFilter {
    return {
      statuses: input.statuses === null ? null : this.distinct(input.statuses),
      priorities: input.priorities === null ? null : this.distinct(input.priorities),
      assignees: input.assignees === null ? null : this.assignees(input.assignees, actorUserId),
      labelKeys:
        input.labels === null
          ? null
          : this.distinct(input.labels.map((label: string): string => labelKey(label))),
      search: input.search,
      dueFrom: input.dueFrom,
      dueTo: input.dueTo,
      rootsOnly: input.level === 'roots',
    };
  }

  /**
   * Method assignees
   *
   * @description
   * Splits the tokens `me`, `none` and account ids.
   *
   * @param {readonly string[]} tokens - The tokens of the route.
   * @param {string} actorUserId - The account `me` stands for.
   * @returns {NonNullable<TaskFilter['assignees']>} The accounts and whether `none` was asked.
   */
  private assignees(
    tokens: readonly string[],
    actorUserId: string,
  ): NonNullable<TaskFilter['assignees']> {
    return {
      userIds: this.distinct(
        tokens
          .filter((token: string): boolean => token !== 'none')
          .map((token: string): string => (token === 'me' ? actorUserId : token.toLowerCase())),
      ),
      unassigned: tokens.includes('none'),
    };
  }

  /**
   * Method distinct
   *
   * @description
   * Removes the duplicates of a list, keeping the first occurrences in order.
   *
   * @param {readonly TValue[]} values - The values.
   * @returns {readonly TValue[]} The values without duplicates.
   */
  private distinct<TValue>(values: readonly TValue[]): readonly TValue[] {
    return [...new Set<TValue>(values)];
  }
  // #endregion
}
