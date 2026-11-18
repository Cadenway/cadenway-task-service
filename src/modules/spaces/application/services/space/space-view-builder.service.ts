import type { SpaceState } from '../../../domain/value-objects/space/space-state.value-object.js';
import type { SpaceView } from '../../projections/space/space-view.projection.js';
import type { SpacePrefixRepository } from '../../ports/outbound/persistence/space/space-prefix-repository.port.js';

/**
 * Class SpaceViewBuilder
 *
 * @description
 * Adds to spaces the key their next task would take (`nextKey`, `<prefix>-<n>`), read from the
 * counters of their prefixes in the transaction of the caller; it reserves nothing.
 */
export class SpaceViewBuilder {
  // #region Methods
  /**
   * Method build
   *
   * @description
   * Builds the views of spaces with ONE reading of the counters, whatever their number.
   *
   * @param {SpacePrefixRepository} prefixes - The prefixes, bound to the transaction of the caller.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly SpaceState[]} spaces - The spaces.
   * @returns {Promise<SpaceView[]>} Their views, in the same order.
   */
  public async build(
    prefixes: SpacePrefixRepository,
    organizationId: string,
    spaces: readonly SpaceState[],
  ): Promise<SpaceView[]> {
    if (spaces.length === 0) {
      return [];
    }
    const numbers: ReadonlyMap<string, number> = await prefixes.nextNumbers(organizationId, [
      ...new Set(spaces.map((space: SpaceState): string => space.prefix)),
    ]);
    return spaces.map((space: SpaceState): SpaceView => ({
      space,
      // A prefix without a counter has given no number yet: the next one is 1.
      nextKey: `${space.prefix}-${String(numbers.get(space.prefix) ?? 1)}`,
    }));
  }

  /**
   * Method buildOne
   *
   * @description
   * Builds the view of one space.
   *
   * @param {SpacePrefixRepository} prefixes - The prefixes, bound to the transaction of the caller.
   * @param {string} organizationId - The organization of the transaction.
   * @param {SpaceState} space - The space.
   * @returns {Promise<SpaceView>} Its view.
   */
  public async buildOne(
    prefixes: SpacePrefixRepository,
    organizationId: string,
    space: SpaceState,
  ): Promise<SpaceView> {
    const numbers: ReadonlyMap<string, number> = await prefixes.nextNumbers(organizationId, [
      space.prefix,
    ]);
    return { space, nextKey: `${space.prefix}-${String(numbers.get(space.prefix) ?? 1)}` };
  }
  // #endregion
}
