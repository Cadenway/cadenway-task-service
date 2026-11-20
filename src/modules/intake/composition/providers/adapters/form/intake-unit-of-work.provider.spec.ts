import { getOrganizationContext, runWithOrganizationContext } from '@cadenway/nest-common';
import type { OrganizationContext } from '@cadenway/nest-common';
import type { TransactionScope } from '@cadenway/nest-common/database';
import { describe, expect, it, vi } from 'vitest';

import { intakeUnitOfWorkProvider } from './intake-unit-of-work.provider.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const otherOrganizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e02';
const listId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e03';
const editorUserId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e04';
const publicKey = 'T3Wf3e3VdFKPIsnP7t9m2kUuwtHTU2yXrP-Ekq11BRg';

const applicant: OrganizationContext = {
  organizationId: null,
  actor: { type: 'system', id: null },
  role: null,
  scopes: [],
};

const editor: OrganizationContext = {
  organizationId,
  actor: { type: 'user', id: editorUserId },
  role: 'member',
  scopes: [],
};

async function setup() {
  const system = {
    run: vi.fn().mockResolvedValue({ organizationId, listId }),
  };
  const tenant = {
    run: vi.fn(async (work: (scope: TransactionScope) => Promise<unknown>) =>
      work({ db: {} } as TransactionScope),
    ),
  };
  const delegate = { execute: vi.fn() };
  return {
    unit: await intakeUnitOfWorkProvider.useFactory(
      system,
      tenant,
      delegate,
      delegate,
      delegate,
      delegate,
    ),
    system,
    tenant,
  };
}

describe('Intake unit of work', () => {
  it('refuses to resolve a publication or rebind the tenant for an editor', async () => {
    const { unit, system, tenant } = await setup();
    runWithOrganizationContext(editor, () => {
      expect(() => unit.resolvePublicKey(publicKey)).toThrow();
      expect(() => unit.read(otherOrganizationId, vi.fn())).toThrow();
    });
    expect(system.run).not.toHaveBeenCalled();
    expect(tenant.run).not.toHaveBeenCalled();
  });

  it('enters the publication tenant only after the read-only system lookup', async () => {
    const { unit, system, tenant } = await setup();
    await runWithOrganizationContext(applicant, async () => {
      const target = await unit.resolvePublicKey(publicKey);
      expect(target).toEqual({ organizationId, listId });
      const inside = await unit.read(target?.organizationId ?? '', async () =>
        Promise.resolve(getOrganizationContext()),
      );
      expect(inside).toEqual({ ...applicant, organizationId });
      expect(getOrganizationContext()).toEqual(applicant);
    });

    expect(system.run).toHaveBeenCalledWith(expect.any(Function), { readOnly: true });
    expect(tenant.run).toHaveBeenCalledWith(expect.any(Function), {
      readOnly: true,
      isolationLevel: 'repeatable read',
    });
    expect(system.run.mock.invocationCallOrder[0]).toBeLessThan(
      tenant.run.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
