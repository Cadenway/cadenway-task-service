import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import type { CheckedLock } from '../../models/access/checked-lock.model.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';

/**
 * Class CheckedLocker
 *
 * @description
 * The ONE way a write of the spaces module locks a space or a list for an actor: it reads the row
 * without lock first and lets the caller check the actor on it (its visibility and its role, the
 * refusals `404` then `403` of the write), so that a space or a list the actor does not see, or may
 * not change, answers at once, even while another transaction holds it locked: waiting would tell
 * that it exists. Then it locks the rows (spaces before lists, the lock order of the module) and,
 * when one of them changed meanwhile (another version), checks again on the locked rows, whose
 * answer wins. A tombstone reads as unknown, unlocked or locked. `If-Match` and the rules of the
 * domain come after, on the locked rows, in the caller.
 */
export class CheckedLocker {
  // #region Methods
  /**
   * Method space
   *
   * @description
   * Reads a space without lock and checks the actor on it, then locks it `FOR NO KEY UPDATE`
   * (`update`) or `FOR SHARE` (`share`), and checks again when it changed meanwhile.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @param {'update' | 'share'} mode - The lock of the space.
   * @param {(space: Space) => Promise<TRefusal | null>} refusalOf - The check of the caller: the
   * refusal of the actor on the space, or `null` to accept.
   * @returns {Promise<CheckedLock<Space, TRefusal>>} The locked space, the refusal, or `unknown`.
   */
  public async space<TRefusal>(
    store: SpacesStore,
    organizationId: string,
    spaceId: string,
    mode: 'update' | 'share',
    refusalOf: (space: Space) => Promise<TRefusal | null>,
  ): Promise<CheckedLock<Space, TRefusal>> {
    const seen: Space | null = await store.spaces.find(organizationId, spaceId);
    if (seen === null) {
      return { outcome: 'unknown' };
    }
    const before: TRefusal | null = await refusalOf(seen);
    if (before !== null) {
      return { outcome: 'refused', refusal: before };
    }
    const locked: Space | null =
      mode === 'share'
        ? await store.spaces.lockShared(organizationId, spaceId)
        : await store.spaces.lock(organizationId, spaceId);
    if (locked === null) {
      return { outcome: 'unknown' };
    }
    if (locked.snapshot.version !== seen.snapshot.version) {
      const after: TRefusal | null = await refusalOf(locked);
      if (after !== null) {
        return { outcome: 'refused', refusal: after };
      }
    }
    return { outcome: 'locked', locked };
  }

  /**
   * Method list
   *
   * @description
   * Reads a list and its space without lock and checks the actor on them, then locks the space
   * `FOR SHARE` (`share`, its owner cannot change meanwhile) or leaves it unlocked (`none`), then
   * the list `FOR NO KEY UPDATE`, and checks again when one of them changed meanwhile (the space
   * read again when it is not locked). A list never changes space.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @param {'none' | 'share'} spaceMode - The lock of the space of the list.
   * @param {(space: Space, list: TaskList) => Promise<TRefusal | null>} refusalOf - The check of
   * the caller: the refusal of the actor on the list, or `null` to accept.
   * @returns {Promise<CheckedLock<{ readonly space: Space; readonly list: TaskList }, TRefusal>>}
   * The space and the locked list, the refusal, or `unknown`.
   */
  public async list<TRefusal>(
    store: SpacesStore,
    organizationId: string,
    listId: string,
    spaceMode: 'none' | 'share',
    refusalOf: (space: Space, list: TaskList) => Promise<TRefusal | null>,
  ): Promise<CheckedLock<{ readonly space: Space; readonly list: TaskList }, TRefusal>> {
    const seenList: TaskList | null = await store.lists.find(organizationId, listId);
    const seenSpace: Space | null =
      seenList === null ? null : await store.spaces.find(organizationId, seenList.snapshot.spaceId);
    if (seenList === null || seenSpace === null) {
      return { outcome: 'unknown' };
    }
    const before: TRefusal | null = await refusalOf(seenSpace, seenList);
    if (before !== null) {
      return { outcome: 'refused', refusal: before };
    }
    const lockedSpace: Space | null =
      spaceMode === 'share'
        ? await store.spaces.lockShared(organizationId, seenSpace.snapshot.id)
        : seenSpace;
    const list: TaskList | null = await store.lists.lock(organizationId, listId);
    if (lockedSpace === null || list === null) {
      return { outcome: 'unknown' };
    }
    if (
      list.snapshot.version === seenList.snapshot.version &&
      lockedSpace.snapshot.version === seenSpace.snapshot.version
    ) {
      return { outcome: 'locked', locked: { space: lockedSpace, list } };
    }
    const space: Space | null =
      spaceMode === 'share'
        ? lockedSpace
        : await store.spaces.find(organizationId, seenSpace.snapshot.id);
    if (space === null) {
      return { outcome: 'unknown' };
    }
    const after: TRefusal | null = await refusalOf(space, list);
    if (after !== null) {
      return { outcome: 'refused', refusal: after };
    }
    return { outcome: 'locked', locked: { space, list } };
  }
  // #endregion
}
