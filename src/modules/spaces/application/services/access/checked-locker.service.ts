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
   * `FOR SHARE` and the list `FOR NO KEY UPDATE`, spaces before lists, and checks again on the
   * locked rows when one of them changed meanwhile. Under the two locks every input of the role
   * of the actor is held: the membership by the caller, the space and its grants by the lock of
   * the space (a change of its visibility, its owner or its grants locks it `FOR NO KEY UPDATE`
   * and takes its next version), the list and its grants by the lock of the list (the same). So
   * two equal versions under the locks give the role checked before them, and a revocation
   * committed while a lock waited shows as a new version, which the check reads again. A list
   * never changes space.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @param {(space: Space, list: TaskList) => Promise<TRefusal | null>} refusalOf - The check of
   * the caller: the refusal of the actor on the list, or `null` to accept.
   * @returns {Promise<CheckedLock<{ readonly space: Space; readonly list: TaskList }, TRefusal>>}
   * The locked space and list, the refusal, or `unknown`.
   */
  public async list<TRefusal>(
    store: SpacesStore,
    organizationId: string,
    listId: string,
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
    const space: Space | null = await store.spaces.lockShared(
      organizationId,
      seenSpace.snapshot.id,
    );
    const list: TaskList | null = await store.lists.lock(organizationId, listId);
    if (space === null || list === null) {
      return { outcome: 'unknown' };
    }
    if (
      list.snapshot.version !== seenList.snapshot.version ||
      space.snapshot.version !== seenSpace.snapshot.version
    ) {
      const after: TRefusal | null = await refusalOf(space, list);
      if (after !== null) {
        return { outcome: 'refused', refusal: after };
      }
    }
    return { outcome: 'locked', locked: { space, list } };
  }
  // #endregion
}
