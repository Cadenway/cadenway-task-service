import { describe, expect, it } from 'vitest';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import { CreateSubtaskBody } from '../../dto/input/subtask/create-subtask-body.dto.js';
import { CreateTaskBody } from '../../dto/input/task/create-task-body.dto.js';
import { toCreateSubtaskInput, toCreateTaskInput } from './task-creation.mapper.js';

const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';
const HUGO = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';
const LIST = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b02';

/** Camille Martin (CM) in Atelier Nord. */
const CALLER: Caller = {
  organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f',
  actorUserId: CAMILLE,
};

describe('toCreateTaskInput', () => {
  it('applies the defaults of the contract and gives the members left out as null', () => {
    const body = CreateTaskBody.schema.parse({ name: 'Ajouter la connexion par lien magique' });

    expect(toCreateTaskInput(CALLER, LIST, body)).toStrictEqual({
      ...CALLER,
      listId: LIST,
      name: 'Ajouter la connexion par lien magique',
      description: null,
      status: 'todo',
      cancelReason: null,
      cancelNote: null,
      priority: 'moyenne',
      assigneeIds: [],
      dueDate: null,
      startDate: null,
      estimateMinutes: null,
      labels: [],
      subtaskNames: [],
    });
  });

  it('keeps the members given, lower-cases the accounts and the list and reduces a subtask to its name', () => {
    const body = CreateTaskBody.schema.parse({
      name: 'Ajouter la connexion par lien magique',
      description: '## Contexte',
      status: 'cancelled',
      cancelReason: 'scope',
      cancelNote: 'Hors sprint',
      priority: 'haute',
      assigneeIds: [HUGO.toUpperCase()],
      dueDate: '2026-11-20',
      startDate: '2026-11-18',
      estimateMinutes: 480,
      labels: ['auth'],
      subtasks: [{ name: 'Relire les messages' }, { name: 'Tester le lien expiré' }],
    });

    expect(toCreateTaskInput(CALLER, LIST.toUpperCase(), body)).toStrictEqual({
      ...CALLER,
      listId: LIST,
      name: 'Ajouter la connexion par lien magique',
      description: '## Contexte',
      status: 'cancelled',
      cancelReason: 'scope',
      cancelNote: 'Hors sprint',
      priority: 'haute',
      assigneeIds: [HUGO],
      dueDate: '2026-11-20',
      startDate: '2026-11-18',
      estimateMinutes: 480,
      labels: ['auth'],
      subtaskNames: ['Relire les messages', 'Tester le lien expiré'],
    });
  });
});

describe('toCreateSubtaskInput', () => {
  it('gives null assignees when the body leaves them out, so the subtask inherits the first one', () => {
    const body = CreateSubtaskBody.schema.parse({ name: 'Relire les messages' });

    expect(toCreateSubtaskInput(CALLER, 'CAD-482', body).assigneeIds).toBeNull();
  });

  it('keeps an empty list of assignees distinct from an absent one', () => {
    const body = CreateSubtaskBody.schema.parse({ name: 'Relire', assigneeIds: [] });

    expect(toCreateSubtaskInput(CALLER, 'CAD-482', body).assigneeIds).toStrictEqual([]);
  });

  it('applies the defaults of the contract and lower-cases the accounts', () => {
    const body = CreateSubtaskBody.schema.parse({
      name: 'Relire les messages',
      assigneeIds: [HUGO.toUpperCase()],
    });

    expect(toCreateSubtaskInput(CALLER, 'CAD-482', body)).toStrictEqual({
      ...CALLER,
      taskKey: 'CAD-482',
      name: 'Relire les messages',
      description: null,
      status: 'todo',
      cancelReason: null,
      cancelNote: null,
      priority: 'moyenne',
      assigneeIds: [HUGO],
      dueDate: null,
      startDate: null,
      estimateMinutes: null,
      labels: [],
    });
  });
});
