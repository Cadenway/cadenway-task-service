import { describe, expect, it } from 'vitest';

import type {
  ListOrganizationsWithTrashToPurge,
  ListOrganizationsWithTrashToPurgeInput,
  ListOrganizationsWithTrashToPurgeOutput,
} from '../../../../tasks/public/trash/list-organizations-with-trash-to-purge.js';
import { TasksOrganizationsWithTrash } from './organizations-with-trash.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Another organization with trash to erase. */
const OTHER_ORGANIZATION: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99';

describe('TasksOrganizationsWithTrash: one page of ListOrganizationsWithTrashToPurge', () => {
  it('asks for the page after the given organization and answers its ids', async () => {
    const inputs: ListOrganizationsWithTrashToPurgeInput[] = [];
    const operation = {
      execute: (
        input: ListOrganizationsWithTrashToPurgeInput,
      ): Promise<ListOrganizationsWithTrashToPurgeOutput> => {
        inputs.push(input);
        return Promise.resolve({ organizationIds: [OTHER_ORGANIZATION] });
      },
    } as unknown as ListOrganizationsWithTrashToPurge;

    const page = await new TasksOrganizationsWithTrash(operation).page(ATELIER_NORD, 1_000);

    expect(inputs).toEqual([{ after: ATELIER_NORD, limit: 1_000 }]);
    expect(page).toEqual([OTHER_ORGANIZATION]);
  });
});
