import { DuplicateListInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { runWithOrganizationContext } from '@cadenway/nest-common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { PlacedList } from '../../../../application/models/placement/placed-list.model.js';
import type { DuplicateList } from '../../../../application/use-cases/commands/list/duplicate-list/duplicate-list.use-case.js';
import { ListDuplicateController } from './list-duplicate.controller.js';

const ORGANIZATION = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const SOURCE = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f12';
const COPY = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f15';

/** A copied list returned by the duplication use case. */
const copied: PlacedList = {
  id: COPY,
  spaceId: ORGANIZATION,
  name: 'Sprint 14 (copie)',
  icon: null,
  color: 'bleu',
  sprint: null,
  createdAt: new Date('2026-11-20T09:00:00.000Z'),
  position: new Date('2026-11-20T09:00:00.000Z'),
  version: 1,
  organizationAccess: false,
  archivedAt: null,
  archivedBy: null,
  callerRole: 'edit',
};

describe('the list duplication controller', () => {
  it('returns the copied list and task count with its location and version ETag', async () => {
    const execute = vi.fn().mockResolvedValue({ list: copied, taskCount: 5 });
    const controller = new ListDuplicateController({ execute } as unknown as DuplicateList);
    const setHeader = vi.fn();
    const request = {
      is: () => 'application/json',
      headers: { 'content-length': '2' },
    } as unknown as Request;

    const body = await runWithOrganizationContext(
      {
        organizationId: ORGANIZATION,
        actor: { type: 'user', id: CAMILLE },
        role: null,
        scopes: [],
      },
      () =>
        controller.duplicate({ listId: SOURCE.toUpperCase() }, {}, '"4"', request, {
          setHeader,
        } as unknown as Response),
    );

    expect(execute).toHaveBeenCalledWith({
      organizationId: ORGANIZATION,
      actorUserId: CAMILLE,
      listId: SOURCE,
      expectedVersions: [4],
    });
    expect(setHeader).toHaveBeenCalledWith('Location', `/internal/v1/lists/${COPY}`);
    expect(setHeader).toHaveBeenCalledWith('ETag', '"1"');
    expect(DuplicateListInternalResponse.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ list: { id: COPY, sprint: null }, taskCount: 5 });
    expect(body.list).not.toHaveProperty('position');
  });
});
