import type { AccessRequestState } from './value-objects/access-request/access-request-state.value-object.js';

/** Organization "Atelier Nord". */
export const ATELIER_NORD = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Another organization than Atelier Nord. */
export const OTHER_ORGANIZATION = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99';

/** Camille Martin (CM), who asks for the private space "Direction". */
export const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

/** Hugo Dubois (HD), who asks for the list "Budget" and for DIR-12. */
export const HUGO = '019a5f3c-a0b1-7c2d-9e3f-5a6b7c8d9e32';

/** Léa Petit, owner of the private space "Direction". */
export const LEA = '019a5f3c-b2c3-7d4e-8f5a-6b7c8d9e0f33';

/** Inès Roche (IR), a member who manages nothing of "Direction". */
export const INES = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

/** The private space "Direction" of Léa Petit. */
export const DIRECTION = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e09';

/** The list "Budget" of "Direction". */
export const BUDGET = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f30';

/** Another list of "Direction", "Recrutement". */
export const RECRUTEMENT = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f31';

/** The task DIR-12 "Budget 2027" of "Budget". */
export const DIR_12 = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1a12';

/** The request of Camille Martin for "Direction". */
export const SPACE_REQUEST = '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f01';

/** The request of Hugo Dubois for DIR-12. */
export const TASK_REQUEST = '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f02';

/** The request of Hugo Dubois for "Budget". */
export const LIST_REQUEST = '019a7007-8b9c-7d0e-8f1a-2b3c4d5e6f03';

/** When Camille Martin asked for "Direction", as the contract example says. */
export const ASKED_AT: Date = new Date('2026-11-08T11:02:00.000Z');

/** When Léa Petit answers, as the contract example says. */
export const DECIDED_AT: Date = new Date('2026-11-08T14:30:00.000Z');

/**
 * The request of Camille Martin for the private space "Direction", pending.
 *
 * @param overrides - Members to replace.
 * @returns The state.
 */
export function spaceRequestState(overrides: Partial<AccessRequestState> = {}): AccessRequestState {
  return {
    organizationId: ATELIER_NORD,
    id: SPACE_REQUEST,
    target: 'space',
    targetId: DIRECTION,
    spaceId: DIRECTION,
    listId: null,
    taskId: null,
    taskKey: null,
    requesterUserId: CAMILLE,
    message: 'Je dois chiffrer la part outillage du budget 2027.',
    status: 'pending',
    role: null,
    createdAt: ASKED_AT,
    decidedAt: null,
    decidedBy: null,
    ...overrides,
  };
}

/**
 * The request of Hugo Dubois for the list "Budget" of "Direction", pending, without message.
 *
 * @param overrides - Members to replace.
 * @returns The state.
 */
export function listRequestState(overrides: Partial<AccessRequestState> = {}): AccessRequestState {
  return {
    ...spaceRequestState(),
    id: LIST_REQUEST,
    target: 'list',
    targetId: BUDGET,
    listId: BUDGET,
    requesterUserId: HUGO,
    message: null,
    createdAt: new Date('2026-11-08T09:10:00.000Z'),
    ...overrides,
  };
}

/**
 * The request of Hugo Dubois for DIR-12 "Budget 2027", in "Budget" when he asked, pending.
 *
 * @param overrides - Members to replace.
 * @returns The state.
 */
export function taskRequestState(overrides: Partial<AccessRequestState> = {}): AccessRequestState {
  return {
    ...listRequestState(),
    id: TASK_REQUEST,
    target: 'task',
    targetId: DIR_12,
    taskId: DIR_12,
    taskKey: 'DIR-12',
    createdAt: new Date('2026-11-08T09:12:00.000Z'),
    ...overrides,
  };
}
