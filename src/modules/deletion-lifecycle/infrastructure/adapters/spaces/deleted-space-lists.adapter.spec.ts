import { describe, expect, it } from 'vitest';

import type {
  ListDeletedSpaceLists,
  ListDeletedSpaceListsInput,
  ListDeletedSpaceListsOutput,
} from '../../../../spaces/public/list/list-deleted-space-lists.js';
import { SpacesDeletedSpaceLists } from './deleted-space-lists.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The space "Produit", deleted. */
const PRODUIT: string = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';

/** The list "Sprint 14" of "Produit", deleted. */
const SPRINT_14: string = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f14';

/**
 * Builds the adapter on an operation that records its input and answers `output`.
 *
 * @param output - The answer of the operation.
 * @returns The adapter and the inputs.
 */
function adapterOn(output: ListDeletedSpaceListsOutput): {
  readonly adapter: SpacesDeletedSpaceLists;
  readonly inputs: ListDeletedSpaceListsInput[];
} {
  const inputs: ListDeletedSpaceListsInput[] = [];
  const operation = {
    execute: (input: ListDeletedSpaceListsInput): Promise<ListDeletedSpaceListsOutput> => {
      inputs.push(input);
      return Promise.resolve(output);
    },
  } as unknown as ListDeletedSpaceLists;
  return { adapter: new SpacesDeletedSpaceLists(operation), inputs };
}

describe('SpacesDeletedSpaceLists: the deleted lists of a space through ListDeletedSpaceLists', () => {
  it('asks for the space and answers whether it is still deleted, with its deleted lists', async () => {
    const { adapter, inputs } = adapterOn({ spaceDeleted: true, listIds: [SPRINT_14] });

    const listing = await adapter.deletedListsOf(ATELIER_NORD, PRODUIT);

    expect(inputs).toEqual([{ organizationId: ATELIER_NORD, spaceId: PRODUIT }]);
    expect(listing).toEqual({ spaceDeleted: true, listIds: [SPRINT_14] });
  });

  it('answers a space a restoration brought back, with its lists still deleted', async () => {
    const { adapter } = adapterOn({ spaceDeleted: false, listIds: [SPRINT_14] });

    await expect(adapter.deletedListsOf(ATELIER_NORD, PRODUIT)).resolves.toEqual({
      spaceDeleted: false,
      listIds: [SPRINT_14],
    });
  });
});
