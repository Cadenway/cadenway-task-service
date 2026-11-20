import { ExecuteBulkTaskActionInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException, runWithOrganizationContext } from '@cadenway/nest-common';
import { describe, expect, it, vi } from 'vitest';

import { BulkTaskExpansionError } from '../../../../application/models/bulk/bulk-task-expansion.model.js';
import type { BulkTaskAction } from '../../../../application/use-cases/commands/bulk/bulk-task-action/bulk-task-action.use-case.js';
import { BulkTaskActionsController } from './bulk-task-actions.controller.js';

vi.mock(
  '../../../../application/use-cases/commands/bulk/bulk-task-action/bulk-task-action.use-case.js',
  () => ({
    BulkTaskAction: class BulkTaskAction {
      public execute(): undefined {
        return undefined;
      }
    },
  }),
);

const ORGANIZATION = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

/** Runs the controller under the verified organization and actor. */
function asCamille<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId: ORGANIZATION, actor: { type: 'user', id: CAMILLE }, role: null, scopes: [] },
    work,
  );
}

describe('the bulk task action controller', () => {
  it('forwards the caller and selection, and returns only contract fields', async () => {
    const execute = vi.fn().mockResolvedValue({
      results: [{ taskKey: 'CAD-482', version: 13, internalId: 'must-not-travel' }],
      affectedCount: 1,
      internal: 'must-not-travel',
    });
    const controller = new BulkTaskActionsController({ execute } as unknown as BulkTaskAction);
    const body = {
      selection: [{ taskKey: 'CAD-482', version: 12 }],
      action: { type: 'trash' as const },
    };

    const result = await asCamille(() => controller.execute(body));

    expect(execute).toHaveBeenCalledWith({
      organizationId: ORGANIZATION,
      actorUserId: CAMILLE,
      ...body,
    });
    expect(result).toEqual({ results: [{ taskKey: 'CAD-482', version: 13 }], affectedCount: 1 });
    expect(ExecuteBulkTaskActionInternalResponse.safeParse(result).success).toBe(true);
  });

  it('turns an expansion refusal into the published 422 problem', async () => {
    const execute = vi.fn().mockRejectedValue(new BulkTaskExpansionError());
    const controller = new BulkTaskActionsController({ execute } as unknown as BulkTaskAction);
    const error: unknown = await asCamille(() =>
      controller.execute({ selection: [{ taskKey: 'CAD-482' }], action: { type: 'trash' } }),
    ).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ProblemException);
    expect(error instanceof ProblemException ? error.problem.status : null).toBe(422);
    expect(error instanceof ProblemException ? error.problem.code : null).toBe(
      'bulk.expansion-limit-reached',
    );
  });
});
