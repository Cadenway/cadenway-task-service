import { describe, expect, it, vi } from 'vitest';

import type { CustomFieldDefinition } from '../../../domain/value-objects/custom-field/custom-field-definition.value-object.js';
import type { CustomFieldsStore } from '../../models/custom-field/custom-fields-store.model.js';
import { CustomFieldDefinitions } from './custom-field-definitions.service.js';

const organizationId = '019a7000-0000-7000-8000-000000000001';
const spaceId = '019a7000-0000-7000-8000-000000000002';
const firstId = '019a7000-0000-7000-8000-000000000003';
const secondId = '019a7000-0000-7000-8000-000000000004';

function fields(): readonly CustomFieldDefinition[] {
  return [
    {
      id: firstId,
      spaceId,
      name: 'Points',
      type: 'number',
      position: 0,
      sprintPoints: false,
      version: 1,
    },
    {
      id: secondId,
      spaceId,
      name: 'Client',
      type: 'text',
      position: 1,
      sprintPoints: false,
      version: 2,
    },
  ];
}

function fixture(negative = false) {
  const repository = {
    activeDefinitions: vi.fn().mockResolvedValue(fields()),
    saveDefinitions: vi.fn().mockResolvedValue(undefined),
    hasNegativeValues: vi.fn().mockResolvedValue(negative),
    retire: vi.fn().mockResolvedValue(undefined),
  };
  const now = new Date('2026-11-20T11:00:00Z');
  const store = {
    fields: repository,
    clock: { now: vi.fn().mockResolvedValue(now) },
  } as unknown as CustomFieldsStore;
  return { repository, now, store, service: new CustomFieldDefinitions() };
}

describe('CustomFieldDefinitions', () => {
  it('does not write a no-op and rejects a stale version before touching values', async () => {
    const { service, store, repository } = fixture();
    await expect(
      service.update(store, organizationId, spaceId, firstId, [1], { name: ' Points ' }),
    ).resolves.toMatchObject({ version: 1 });
    expect(repository.saveDefinitions).not.toHaveBeenCalled();
    await expect(
      service.update(store, organizationId, spaceId, firstId, [2], { sprintPoints: true }),
    ).rejects.toMatchObject({ reason: 'version-mismatch', version: 1 });
    expect(repository.hasNegativeValues).not.toHaveBeenCalled();
  });

  it('refuses negative points without changing any definition', async () => {
    const { service, store, repository } = fixture(true);
    await expect(
      service.update(store, organizationId, spaceId, firstId, [1], { sprintPoints: true }),
    ).rejects.toMatchObject({ reason: 'sprint-points-invalid' });
    expect(repository.saveDefinitions).not.toHaveBeenCalled();
  });

  it('keeps retirement and shifted versions in one repository operation', async () => {
    const { service, store, repository, now } = fixture();
    await service.retire(store, organizationId, spaceId, firstId, [1]);
    expect(repository.retire).toHaveBeenCalledWith(
      organizationId,
      spaceId,
      expect.objectContaining({ id: firstId, version: 2 }),
      [expect.objectContaining({ id: secondId, version: 3, position: 0 })],
      now,
    );
  });

  it('returns a position cursor without exposing a definition from another space', async () => {
    const { service, store } = fixture();
    const first = await service.page(store, organizationId, spaceId, null, 1);
    expect(first.items.map((item) => item.id)).toEqual([firstId]);
    expect(first.next).toEqual({ position: 0, id: firstId });
    const second = await service.page(store, organizationId, spaceId, first.next, 1);
    expect(second.items.map((item) => item.id)).toEqual([secondId]);
    expect(second.next).toBeNull();
    await expect(
      service.get(store, organizationId, spaceId, '019a7000-0000-7000-8000-000000000005'),
    ).rejects.toMatchObject({ reason: 'not-found' });
  });
});
