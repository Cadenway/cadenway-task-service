import { describe, expect, it } from 'vitest';

import type {
  PurgeTrashBatch,
  PurgeTrashBatchInput,
  PurgeTrashBatchOutput,
} from '../../../../tasks/public/trash/purge-trash-batch.js';
import { TasksTrashPurge } from './trash-purge.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/**
 * Builds the adapter on an operation that records its input and answers `output`.
 *
 * @param output - The answer of the operation.
 * @returns The adapter and the inputs.
 */
function adapterOn(output: PurgeTrashBatchOutput): {
  readonly adapter: TasksTrashPurge;
  readonly inputs: PurgeTrashBatchInput[];
} {
  const inputs: PurgeTrashBatchInput[] = [];
  const operation = {
    execute: (input: PurgeTrashBatchInput): Promise<PurgeTrashBatchOutput> => {
      inputs.push(input);
      return Promise.resolve(output);
    },
  } as unknown as PurgeTrashBatch;
  return { adapter: new TasksTrashPurge(operation), inputs };
}

describe('TasksTrashPurge: one batch of PurgeTrashBatch', () => {
  it('asks for a batch of the organization and maps what it erased', async () => {
    const { adapter, inputs } = adapterOn({
      outcome: 'purged',
      entries: 20,
      tasks: 520,
      listsPurged: 1,
      spacesPurged: 0,
    });

    const batch = await adapter.purgeBatch(ATELIER_NORD);

    expect(inputs).toEqual([{ organizationId: ATELIER_NORD }]);
    expect(batch).toEqual({
      outcome: 'purged',
      entries: 20,
      tasks: 520,
      listsPurged: 1,
      spacesPurged: 0,
    });
  });

  it('maps a batch that found nothing left', async () => {
    const { adapter } = adapterOn({ outcome: 'none-left' });

    await expect(adapter.purgeBatch(ATELIER_NORD)).resolves.toEqual({ outcome: 'none-left' });
  });
});
