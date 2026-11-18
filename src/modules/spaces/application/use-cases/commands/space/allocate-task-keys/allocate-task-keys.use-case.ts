import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { isTaskNumber } from '../../../../../domain/value-objects/space/task-number.value-object.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { AllocateTaskKeysInput } from './allocate-task-keys.input.js';
import type { AllocateTaskKeysOutput } from './allocate-task-keys.output.js';

/**
 * Constant MAX_COUNT
 *
 * @description
 * The most numbers one call hands out: a task and its 25 subtasks ("Subtasks" of
 * `openapi/public/tasks.yaml`).
 *
 * @type {number}
 */
const MAX_COUNT: number = 26;

/**
 * Class AllocateTaskKeys
 *
 * @description
 * Public operation of the spaces module for the tasks module: hands out `count` consecutive task
 * numbers under the current prefix of a space, in the tenant transaction of the caller, which
 * `SpacesUnitOfWork.run` joins. The counter of the prefix advances in one statement that keeps the
 * row locked until the caller commits: creations under one prefix are serialized, a rollback gives
 * the numbers back, and a number is never handed out twice nor left as a gap. The caller therefore
 * calls it last, once every validation passed. It emits nothing and leaves the version of the
 * space unchanged (`nextKey` is a preview, this is the allocation). The caller checked that the
 * actor sees the space (`FindVisibleList`); an unknown space or prefix row, a count outside 1 to 26
 * and a counter past the last number a key can carry are defects of the caller or of the data, not
 * refusals: they throw a plain `Error`, which answers 500.
 */
export class AllocateTaskKeys {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the use case.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork) {
    this.unitOfWork = unitOfWork;
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Hands out the numbers.
   *
   * @param {AllocateTaskKeysInput} input - The space and how many numbers.
   * @returns {Promise<AllocateTaskKeysOutput>} The prefix and the first number of the block.
   * @throws {Error} When the count is not a whole number from 1 to 26, the space or its prefix row
   * is unknown to the organization, or the counter went past 999,999,999.
   */
  public async execute(input: AllocateTaskKeysInput): Promise<AllocateTaskKeysOutput> {
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > MAX_COUNT) {
      throw new Error(`Task keys are allocated 1 to ${String(MAX_COUNT)} at a time.`);
    }
    return this.unitOfWork.run(async (store: SpacesStore): Promise<AllocateTaskKeysOutput> => {
      const space: Space | null = await store.spaces.find(input.organizationId, input.spaceId);
      if (space === null) {
        throw new Error('The space of the task keys is unknown to the organization.');
      }
      const { prefix }: { readonly prefix: string } = space.snapshot;
      const last: number | null = await store.prefixes.allocate(
        input.organizationId,
        prefix,
        input.spaceId,
        input.count,
      );
      if (last === null) {
        throw new Error('The prefix of the space has no counter.');
      }
      // The transaction is rolled back by this throw: no number past the bound is kept.
      if (!isTaskNumber(last)) {
        throw new Error('The task numbers of the prefix are exhausted.');
      }
      return { prefix, firstNumber: last - input.count + 1 };
    });
  }
  // #endregion
}
