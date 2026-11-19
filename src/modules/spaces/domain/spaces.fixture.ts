import type { TaskListState } from './value-objects/list/task-list-state.value-object.js';
import type { Viewer } from './value-objects/member/viewer.value-object.js';
import type { SpaceState } from './value-objects/space/space-state.value-object.js';
import { DEFAULT_SPACE_STATUSES } from './value-objects/status/space-statuses.value-object.js';

/** Organization "Atelier Nord". */
export const ATELIER_NORD = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Camille Martin (CM), the owner of Atelier Nord. */
export const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

/** Account of Inès Robert (IR), an admin of Atelier Nord. */
export const INES = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

/** Account of Hugo Dubois (HD), a member of Atelier Nord. */
export const HUGO = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** Account of Léa Petit (LP), a member of Atelier Nord. */
export const LEA = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b33';

/** Account of Nadia Benali (NB), a guest of Atelier Nord. */
export const NADIA = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b34';

/** The space "Produit" (CAD). */
export const PRODUIT = '019a7000-0000-7000-8000-000000000001';

/** The private space "Design" (DES), owned by Hugo Dubois. */
export const DESIGN = '019a7000-0000-7000-8000-000000000002';

/** The space "Marketing" (MKT). */
export const MARKETING = '019a7000-0000-7000-8000-000000000003';

/** The list "Backlog" of the space "Produit". */
export const BACKLOG = '019a7100-0000-7000-8000-000000000001';

/** The sprint "Sprint 14" of the space "Produit". */
export const SPRINT_14 = '019a7100-0000-7000-8000-000000000002';

/** The goal of Sprint 14. */
export const SPRINT_14_GOAL = 'Livrer la connexion SSO et la page des quotas d’organisation.';

/** When the spaces and lists of the specs were created. */
export const CREATED_AT: Date = new Date('2026-10-20T09:00:00Z');

/** When the specs archive a list ("archivée le 3 nov."). */
export const ARCHIVED_AT: Date = new Date('2026-11-03T09:00:00Z');

/** Camille Martin acting as the owner of the organization. */
export const CAMILLE_VIEWER: Viewer = { userId: CAMILLE, role: 'owner' };

/** Inès Robert acting as an admin. */
export const INES_VIEWER: Viewer = { userId: INES, role: 'admin' };

/** Hugo Dubois acting as a member. */
export const HUGO_VIEWER: Viewer = { userId: HUGO, role: 'member' };

/** Léa Petit acting as a member. */
export const LEA_VIEWER: Viewer = { userId: LEA, role: 'member' };

/** Nadia Benali acting as a guest. */
export const NADIA_VIEWER: Viewer = { userId: NADIA, role: 'guest' };

/**
 * Builds the stored state of the space "Produit" (CAD, violet, rocket), seen by the whole
 * organization and owned by Camille Martin.
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function spaceState(overrides: Partial<SpaceState> = {}): SpaceState {
  return {
    id: PRODUIT,
    organizationId: ATELIER_NORD,
    name: 'Produit',
    prefix: 'CAD',
    description: null,
    icon: 'rocket',
    color: 'violet',
    visibility: 'organization',
    ownerUserId: CAMILLE,
    awaitingOwner: false,
    statuses: DEFAULT_SPACE_STATUSES,
    createdAt: CREATED_AT,
    version: 1,
    ...overrides,
  };
}

/**
 * Builds the stored state of the private space "Design" (DES) owned by Hugo Dubois.
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function designState(overrides: Partial<SpaceState> = {}): SpaceState {
  return spaceState({
    id: DESIGN,
    name: 'Design',
    prefix: 'DES',
    icon: 'paint',
    color: 'fuchsia',
    visibility: 'private',
    ownerUserId: HUGO,
    ...overrides,
  });
}

/**
 * Builds the stored state of the sprint "Sprint 14" of the space "Produit".
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function sprintState(overrides: Partial<TaskListState> = {}): TaskListState {
  return {
    id: SPRINT_14,
    organizationId: ATELIER_NORD,
    spaceId: PRODUIT,
    name: 'Sprint 14',
    icon: null,
    color: 'indigo',
    sprint: { startDate: '2026-11-03', endDate: '2026-11-17', goal: SPRINT_14_GOAL },
    organizationAccess: true,
    createdAt: CREATED_AT,
    archivedAt: null,
    archivedBy: null,
    restoredAt: null,
    version: 1,
    ...overrides,
  };
}

/**
 * Builds the stored state of the list "Backlog" of the space "Produit", which is no sprint.
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function backlogState(overrides: Partial<TaskListState> = {}): TaskListState {
  return sprintState({ id: BACKLOG, name: 'Backlog', color: 'gris', sprint: null, ...overrides });
}
