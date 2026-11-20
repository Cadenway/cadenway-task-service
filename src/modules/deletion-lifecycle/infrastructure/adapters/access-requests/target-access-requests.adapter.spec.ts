import { describe, expect, it } from 'vitest';

import type {
  DropTargetAccessRequests,
  DropTargetAccessRequestsInput,
  DropTargetAccessRequestsOutput,
} from '../../../../access-requests/public/access-request/drop-target-access-requests.js';
import { AccessRequestsTargetAccessRequests } from './target-access-requests.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The list "Sprint 14", deleted. */
const SPRINT_14: string = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f14';

/** The space "Produit", deleted. */
const PRODUIT: string = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';

/** CAD-482, moved to the trash. */
const CAD_482: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1482';

describe('AccessRequestsTargetAccessRequests: the dropping through DropTargetAccessRequests', () => {
  it('passes the organization and the target as they are, and answers how many were dropped', async () => {
    const inputs: DropTargetAccessRequestsInput[] = [];
    const operation = {
      execute: (input: DropTargetAccessRequestsInput): Promise<DropTargetAccessRequestsOutput> => {
        inputs.push(input);
        return Promise.resolve({ dropped: 3 });
      },
    } as unknown as DropTargetAccessRequests;
    const adapter = new AccessRequestsTargetAccessRequests(operation);

    const forList = await adapter.dropPending(ATELIER_NORD, { kind: 'list', listId: SPRINT_14 });
    await adapter.dropPending(ATELIER_NORD, { kind: 'tasks', taskIds: [CAD_482] });

    expect(forList).toBe(3);
    expect(inputs).toEqual([
      { organizationId: ATELIER_NORD, target: { kind: 'list', listId: SPRINT_14 } },
      { organizationId: ATELIER_NORD, target: { kind: 'tasks', taskIds: [CAD_482] } },
    ]);
  });

  it('drops the requests of more than 2,000 tasks 2,000 at a time, the bound of the operation, and adds up', async () => {
    const taskIds = Array.from(
      { length: 2_001 },
      (_, index) => `019a7002-3c4d-7e5f-8a6b-${String(index).padStart(12, '0')}`,
    );
    const inputs: DropTargetAccessRequestsInput[] = [];
    const operation = {
      execute: (input: DropTargetAccessRequestsInput): Promise<DropTargetAccessRequestsOutput> => {
        inputs.push(input);
        return Promise.resolve({ dropped: 2 });
      },
    } as unknown as DropTargetAccessRequests;

    const dropped = await new AccessRequestsTargetAccessRequests(operation).dropPending(
      ATELIER_NORD,
      { kind: 'tasks', taskIds },
    );

    expect(dropped).toBe(4);
    expect(
      inputs.map((input) => (input.target.kind === 'tasks' ? input.target.taskIds.length : 0)),
    ).toEqual([2_000, 1]);
  });

  it('asks nothing for no task, and once for a space', async () => {
    const inputs: DropTargetAccessRequestsInput[] = [];
    const operation = {
      execute: (input: DropTargetAccessRequestsInput): Promise<DropTargetAccessRequestsOutput> => {
        inputs.push(input);
        return Promise.resolve({ dropped: 1 });
      },
    } as unknown as DropTargetAccessRequests;
    const adapter = new AccessRequestsTargetAccessRequests(operation);

    await expect(adapter.dropPending(ATELIER_NORD, { kind: 'tasks', taskIds: [] })).resolves.toBe(
      0,
    );
    await expect(
      adapter.dropPending(ATELIER_NORD, { kind: 'space', spaceId: PRODUIT }),
    ).resolves.toBe(1);
    expect(inputs).toEqual([
      { organizationId: ATELIER_NORD, target: { kind: 'space', spaceId: PRODUIT } },
    ]);
  });
});
