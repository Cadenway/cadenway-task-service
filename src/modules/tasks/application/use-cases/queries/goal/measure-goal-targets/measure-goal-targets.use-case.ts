import type { GoalTargetReader } from '../../../../ports/outbound/persistence/goal/goal-target-reader.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { GoalTargetUnitOfWork } from '../../../../ports/outbound/transactions/goal/goal-target-unit-of-work.port.js';
import type { MeasureGoalTargetsInput } from './measure-goal-targets.input.js';
import type { MeasureGoalTargetsOutput } from './measure-goal-targets.output.js';

/** Resolves goal targets under the same visibility rules as ordinary list and task reads. */
export class MeasureGoalTargets {
  // #region Constructor
  /** Binds target reads to the current tenant transaction and spaces access. */
  public constructor(
    private readonly unit: GoalTargetUnitOfWork,
    private readonly spaces: Pick<SpaceDirectory, 'findVisibleLists' | 'lockTrashLists'>,
  ) {}
  // #endregion

  // #region Methods
  /** Keeps inaccessible and deleted targets out of the resulting maps. */
  public execute(input: MeasureGoalTargetsInput): Promise<MeasureGoalTargetsOutput> {
    const work = async (reader: GoalTargetReader): Promise<MeasureGoalTargetsOutput> => {
      const listIds = [...new Set(input.listIds.map((id) => id.toLowerCase()))];
      const keys = [...new Set(input.milestoneKeys)];
      let milestones =
        keys.length === 0 ? [] : await reader.milestones(input.organizationId, keys, false);
      let candidates = [...new Set([...listIds, ...milestones.map((target) => target.listId)])];
      const visible = new Set<string>();
      for (let index = 0; index < candidates.length; index += 100) {
        const lists = await this.spaces.findVisibleLists(
          input.organizationId,
          input.viewer,
          candidates.slice(index, index + 100),
        );
        for (const list of lists) visible.add(list.id);
      }
      if (input.lock && (visible.size > 0 || input.scopeSpaceId != null)) {
        const visibleKeys = milestones
          .filter((target) => visible.has(target.listId))
          .map((target) => target.key);
        milestones =
          visibleKeys.length === 0
            ? []
            : await reader.milestones(input.organizationId, visibleKeys, true);
        candidates = [
          ...new Set([
            ...listIds.filter((id) => visible.has(id)),
            ...milestones.map((target) => target.listId),
          ]),
        ];
        const held = await this.spaces.lockTrashLists(
          input.organizationId,
          candidates,
          'hold',
          input.viewer,
          ...(input.scopeSpaceId == null ? [] : [[input.scopeSpaceId]]),
        );
        visible.clear();
        for (const list of held) {
          if (list.outcome === 'live' && list.role !== null) visible.add(list.listId);
        }
      }

      const readableLists = listIds.filter((id) => visible.has(id));
      const counts =
        !input.lock && readableLists.length > 0
          ? await reader.listCounts(input.organizationId, readableLists)
          : new Map();
      return {
        lists: new Map(
          readableLists.map((id) => [
            id,
            counts.get(id) ?? { eligibleTaskCount: 0, doneTaskCount: 0 },
          ]),
        ),
        milestones: new Map(
          milestones
            .filter((target) => visible.has(target.listId))
            .map((target) => [target.key, target.status === 'done']),
        ),
      };
    };
    return input.lock ? this.unit.run(work) : this.unit.read(work);
  }
  // #endregion
}
