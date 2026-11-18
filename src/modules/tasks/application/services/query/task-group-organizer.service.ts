import { PRIORITY_KEYS } from '../../../domain/value-objects/task/priority-key.value-object.js';
import { STATUS_KEYS } from '../../../domain/value-objects/task/status-key.value-object.js';
import type { GroupPosition } from '../../models/query/group-position.model.js';
import type { TaskGrouping } from '../../models/query/task-grouping.model.js';
import type { TaskGroupView } from '../../projections/query/task-group.projection.js';

/**
 * Class TaskGroupOrganizer
 *
 * @description
 * Gives the groups of a list their contract shape (`openapi/public/tasks.yaml:313-325`), from the
 * counts the repository read:
 *
 * - `status`: the ten keys in the order of the workflow, zeros included;
 * - `priority`: the four priorities from `urgente` to `basse`, zeros included;
 * - `assignee`: one group per account with at least one task, the most tasks first, ties by
 *   account id; then `none`, always last and always present, even with 0 (the contract is silent
 *   on a zero; open question 4 of the design).
 */
export class TaskGroupOrganizer {
  // #region Methods
  /**
   * Method organize
   *
   * @description
   * Orders every group of a grouping and fills in the zeros.
   *
   * @param {TaskGrouping} grouping - What the tasks are counted by.
   * @param {readonly TaskGroupView[]} rows - The groups the repository counted, in any order.
   * @returns {readonly TaskGroupView[]} Every group, in the order of the contract.
   */
  public organize(
    grouping: TaskGrouping,
    rows: readonly TaskGroupView[],
  ): readonly TaskGroupView[] {
    const counts: ReadonlyMap<string, number> = new Map(
      rows.map((row: TaskGroupView): [string, number] => [row.value, row.count]),
    );
    if (grouping === 'assignee') {
      return [
        ...rows
          .filter((row: TaskGroupView): boolean => row.value !== 'none' && row.count > 0)
          .sort(
            (left: TaskGroupView, right: TaskGroupView): number =>
              right.count - left.count || (left.value < right.value ? -1 : 1),
          ),
        { value: 'none', count: counts.get('none') ?? 0 },
      ];
    }
    return this.keysOf(grouping).map((key: string): TaskGroupView => ({
      value: key,
      count: counts.get(key) ?? 0,
    }));
  }

  /**
   * Method after
   *
   * @description
   * Keeps the groups that follow a position. A status or a priority is found by its place in the
   * contract order; an assignee by its count then its account id, `none` following every account.
   *
   * @param {TaskGrouping} grouping - What the tasks are counted by.
   * @param {readonly TaskGroupView[]} groups - Every group, as `organize` returns them.
   * @param {GroupPosition | null} position - The last group of the previous page, `null` for the
   * first page.
   * @returns {readonly TaskGroupView[]} The groups after the position, in the same order.
   */
  public after(
    grouping: TaskGrouping,
    groups: readonly TaskGroupView[],
    position: GroupPosition | null,
  ): readonly TaskGroupView[] {
    if (position === null) {
      return groups;
    }
    if (grouping !== 'assignee') {
      return groups.slice(this.keysOf(grouping).indexOf(position.value) + 1);
    }
    if (position.value === 'none') {
      return [];
    }
    return groups.filter(
      (group: TaskGroupView): boolean =>
        group.value === 'none' ||
        group.count < position.count ||
        (group.count === position.count && group.value > position.value),
    );
  }

  /**
   * Method keysOf
   *
   * @description
   * The values of a grouping with a closed set, in the order of the contract.
   *
   * @param {TaskGrouping} grouping - `status` or `priority`.
   * @returns {readonly string[]} The keys.
   */
  private keysOf(grouping: TaskGrouping): readonly string[] {
    return grouping === 'status' ? STATUS_KEYS : PRIORITY_KEYS;
  }
  // #endregion
}
