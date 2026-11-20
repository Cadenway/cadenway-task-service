import { describe, expect, it, vi } from 'vitest';

import type { TaskTemplateAccess } from '../../models/template/task-template-access.model.js';
import type { TaskTemplateCaller } from '../../models/template/task-template-caller.model.js';
import type { TaskTemplateSource } from '../../models/template/task-template-source.model.js';
import { TaskTemplateAuthorization } from './task-template-authorization.service.js';

const CALLER: TaskTemplateCaller = {
  organizationId: '019a7001-1a2b-7c3d-8e4f-5a6b7c8d9e01',
  spaceId: '019a7002-1a2b-7c3d-8e4f-5a6b7c8d9e01',
  actorUserId: '019a7003-1a2b-7c3d-8e4f-5a6b7c8d9e01',
};
const LIST = '019a7004-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const TASK: TaskTemplateSource = {
  outcome: 'found',
  source: {
    listId: LIST,
    title: 'Prepare the release',
    description: null,
    priority: 'haute',
    labels: ['Release'],
    checklist: ['Check migration'],
    subtasks: ['Publish notes'],
  },
};

describe('Task template source access', () => {
  it('rechecks a source under the space and list locks before exposing its content', async () => {
    const scope: TaskTemplateAccess = {
      outcome: 'found',
      spaceRole: 'edit',
      listRole: 'edit',
      sourceRestricted: false,
    };
    const sources = {
      scope: vi.fn().mockResolvedValue(scope),
      task: vi.fn().mockResolvedValue(TASK),
    };
    const directory = new TaskTemplateAuthorization(sources);

    await directory.requireSpace(CALLER, 'prepare');
    await expect(directory.readSource(CALLER, 'CAD-123')).resolves.toEqual({
      title: 'Prepare the release',
      description: null,
      priority: 'haute',
      labels: ['Release'],
      checklist: ['Check migration'],
      subtasks: ['Publish notes'],
    });
    expect(sources.scope).toHaveBeenNthCalledWith(1, CALLER, 'prepare');
    expect(sources.scope).toHaveBeenNthCalledWith(2, CALLER, 'write', LIST);
  });

  it.each([
    [
      { outcome: 'found', spaceRole: 'edit', listRole: 'edit', sourceRestricted: true },
      'template.source-restricted',
    ],
    [
      { outcome: 'found', spaceRole: 'edit', listRole: null, sourceRestricted: true },
      'task.not-found',
    ],
    [
      { outcome: 'found', spaceRole: 'edit', listRole: 'view', sourceRestricted: false },
      'access.role-insufficient',
    ],
    [{ outcome: 'space-not-found' }, 'space.not-found'],
  ] as const)('refuses a source after rechecking its locked scope %#', async (scope, code) => {
    const sources = {
      scope: vi.fn().mockResolvedValue(scope),
      task: vi.fn().mockResolvedValue(TASK),
    };
    const directory = new TaskTemplateAuthorization(sources);

    await expect(directory.readSource(CALLER, 'CAD-123')).rejects.toMatchObject({ code });
  });
});
