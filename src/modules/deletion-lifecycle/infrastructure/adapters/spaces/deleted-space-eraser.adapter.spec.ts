import { describe, expect, it } from 'vitest';

import type {
  PurgeDeletedSpace,
  PurgeDeletedSpaceInput,
  PurgeDeletedSpaceOutput,
} from '../../../../spaces/public/space/purge-deleted-space.js';
import { SpacesDeletedSpaceEraser } from './deleted-space-eraser.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The space "Produit", deleted. */
const PRODUIT: string = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';

describe('SpacesDeletedSpaceEraser: the erasure of a deleted space through PurgeDeletedSpace', () => {
  it.each(['purged', 'not-deleted', 'not-empty', 'not-found'] as const)(
    'asks for the erasure of the space and answers %s as it came',
    async (outcome) => {
      const inputs: PurgeDeletedSpaceInput[] = [];
      const operation = {
        execute: (input: PurgeDeletedSpaceInput): Promise<PurgeDeletedSpaceOutput> => {
          inputs.push(input);
          return Promise.resolve({ outcome });
        },
      } as unknown as PurgeDeletedSpace;

      const erased = await new SpacesDeletedSpaceEraser(operation).erase(ATELIER_NORD, PRODUIT);

      expect(inputs).toEqual([{ organizationId: ATELIER_NORD, spaceId: PRODUIT }]);
      expect(erased).toBe(outcome);
    },
  );
});
