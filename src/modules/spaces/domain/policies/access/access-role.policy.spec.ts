import { fc, test } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import {
  CAMILLE,
  CAMILLE_VIEWER,
  DELETED_AT,
  HUGO,
  HUGO_VIEWER,
  INES_VIEWER,
  LEA,
  LEA_VIEWER,
  NADIA,
  NADIA_VIEWER,
  designState,
  spaceState,
  sprintState,
} from '../../spaces.fixture.js';
import type { AccessRole } from '../../value-objects/access/access-role.value-object.js';
import type { ListGrants } from '../../value-objects/access/list-grants.value-object.js';
import type { MemberRole } from '../../value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../value-objects/member/viewer.value-object.js';
import type { SpaceState } from '../../value-objects/space/space-state.value-object.js';
import {
  canCreateSpace,
  canEdit,
  canManageListAccess,
  canManageSpace,
  canSeeSpace,
  highestRole,
  isHighestRole,
  listRoleAsIfNotDeletedOf,
  listRoleOf,
  spaceRoleOf,
} from './access-role.policy.js';

/** No grant anywhere: the rule of the organization and the owner alone. */
const NONE: ListGrants = { space: null, list: null };

/** The sprint "Sprint 14" with its switch on, as every list before P3b-1. */
const SWITCH_ON = sprintState({ organizationAccess: true });

/** The sprint "Sprint 14" with its switch off. */
const SWITCH_OFF = sprintState({ organizationAccess: false });

/** Léa Petit after a demotion to guest, with the grants she held as a member. */
const LEA_AS_GUEST: Viewer = { userId: LEA, role: 'guest' };

const roles: readonly AccessRole[] = ['edit', 'comment', 'view'];

const memberRoles: readonly MemberRole[] = ['owner', 'admin', 'member', 'guest'];

describe('highestRole: the effective role is the highest any source gives', () => {
  it('ranks edit over comment over view, and none below all', () => {
    expect(highestRole(['view', 'edit', 'comment'])).toBe('edit');
    expect(highestRole(['view', null, 'comment'])).toBe('comment');
    expect(highestRole([null, 'view'])).toBe('view');
    expect(highestRole([null, null])).toBeNull();
    expect(highestRole([])).toBeNull();
  });
});

describe('listRoleOf: the rule of the organization (decision 2 of P3b-1)', () => {
  it('gives edit to every owner, admin and member in a space of the organization with the switch on', () => {
    for (const viewer of [CAMILLE_VIEWER, INES_VIEWER, HUGO_VIEWER, LEA_VIEWER]) {
      expect(listRoleOf(spaceState(), SWITCH_ON, viewer, NONE)).toBe('edit');
    }
  });

  it('never reaches a guest', () => {
    expect(listRoleOf(spaceState(), SWITCH_ON, NADIA_VIEWER, NONE)).toBeNull();
  });

  it('gives nothing once the switch is off: the admins and the owner of the organization included', () => {
    const space: SpaceState = spaceState({ ownerUserId: HUGO });

    for (const viewer of [CAMILLE_VIEWER, INES_VIEWER, LEA_VIEWER]) {
      expect(listRoleOf(space, SWITCH_OFF, viewer, NONE)).toBeNull();
    }
  });

  it('gives nothing in a private space, whatever the switch', () => {
    for (const list of [SWITCH_ON, SWITCH_OFF]) {
      expect(listRoleOf(designState(), list, LEA_VIEWER, NONE)).toBeNull();
      expect(listRoleOf(designState(), list, CAMILLE_VIEWER, NONE)).toBeNull();
    }
  });
});

describe('listRoleOf: the owner of the space has edit on every list ("Propriétaire")', () => {
  it('gives the owner edit with the switch off and in a private space', () => {
    expect(listRoleOf(spaceState({ ownerUserId: HUGO }), SWITCH_OFF, HUGO_VIEWER, NONE)).toBe(
      'edit',
    );
    expect(listRoleOf(designState(), SWITCH_OFF, HUGO_VIEWER, NONE)).toBe('edit');
  });

  it('gives a guest who owns a space nothing as owner: a guest holds list grants only', () => {
    const owned: SpaceState = designState({ ownerUserId: NADIA });

    expect(listRoleOf(owned, SWITCH_ON, NADIA_VIEWER, NONE)).toBeNull();
    expect(listRoleOf(owned, SWITCH_ON, NADIA_VIEWER, { space: null, list: 'view' })).toBe('view');
  });
});

describe('listRoleOf: a grant of the space reaches every list of it, whatever the switch', () => {
  it.each(roles)('gives %s on a list of a private space', (role: AccessRole) => {
    expect(listRoleOf(designState(), SWITCH_OFF, LEA_VIEWER, { space: role, list: null })).toBe(
      role,
    );
  });

  it('gives its role on a list whose switch is off in a space of the organization', () => {
    const space: SpaceState = spaceState({ ownerUserId: HUGO });

    expect(listRoleOf(space, SWITCH_OFF, LEA_VIEWER, { space: 'view', list: null })).toBe('view');
  });

  it('is outranked by the rule of the organization while the switch is on', () => {
    expect(listRoleOf(spaceState(), SWITCH_ON, LEA_VIEWER, { space: 'view', list: null })).toBe(
      'edit',
    );
  });
});

describe('listRoleOf: a grant of the list opens that list only', () => {
  it.each(roles)('gives %s to a member in a private space', (role: AccessRole) => {
    expect(listRoleOf(designState(), SWITCH_ON, LEA_VIEWER, { space: null, list: role })).toBe(
      role,
    );
  });

  it('gives a guest the role of the list grant ("Elle ne verra que cette liste")', () => {
    expect(
      listRoleOf(spaceState(), SWITCH_ON, NADIA_VIEWER, { space: null, list: 'comment' }),
    ).toBe('comment');
  });

  it('takes the higher of the space grant and the list grant', () => {
    expect(listRoleOf(designState(), SWITCH_OFF, LEA_VIEWER, { space: 'view', list: 'edit' })).toBe(
      'edit',
    );
    expect(listRoleOf(designState(), SWITCH_OFF, LEA_VIEWER, { space: 'edit', list: 'view' })).toBe(
      'edit',
    );
  });
});

describe('listRoleOf and spaceRoleOf: a member demoted to guest keeps their grants, but space grants give nothing', () => {
  it('keeps the list grant and drops the space grant while she is a guest', () => {
    expect(
      listRoleOf(designState(), SWITCH_OFF, LEA_AS_GUEST, { space: 'edit', list: null }),
    ).toBeNull();
    expect(
      listRoleOf(designState(), SWITCH_OFF, LEA_AS_GUEST, { space: 'edit', list: 'view' }),
    ).toBe('view');
    expect(spaceRoleOf(designState(), LEA_AS_GUEST, 'edit')).toBeNull();
  });
});

describe('listRoleOf, spaceRoleOf, canSeeSpace, canManageSpace: a space awaiting an owner opens to nobody', () => {
  it('gives no role and no sight, grants included', () => {
    const awaiting: SpaceState = designState({ awaitingOwner: true });

    for (const viewer of [HUGO_VIEWER, CAMILLE_VIEWER, LEA_VIEWER, NADIA_VIEWER]) {
      expect(listRoleOf(awaiting, SWITCH_ON, viewer, { space: 'edit', list: 'edit' })).toBeNull();
      expect(spaceRoleOf(awaiting, viewer, 'edit')).toBeNull();
      expect(canSeeSpace(awaiting, viewer, { space: 'edit', anyList: true })).toBe(false);
      expect(canManageSpace(awaiting, viewer)).toBe(false);
    }
  });
});

describe('spaceRoleOf: the role on the space itself', () => {
  it('gives edit to every member in a space of the organization, and to the owner of a private one', () => {
    for (const viewer of [CAMILLE_VIEWER, INES_VIEWER, LEA_VIEWER]) {
      expect(spaceRoleOf(spaceState(), viewer, null)).toBe('edit');
    }
    expect(spaceRoleOf(designState(), HUGO_VIEWER, null)).toBe('edit');
  });

  it('gives the grant of a private space, and nothing without one', () => {
    expect(spaceRoleOf(designState(), LEA_VIEWER, 'comment')).toBe('comment');
    expect(spaceRoleOf(designState(), LEA_VIEWER, null)).toBeNull();
    expect(spaceRoleOf(designState(), CAMILLE_VIEWER, null)).toBeNull();
  });

  it('gives a guest nothing, a grant of the space included', () => {
    expect(spaceRoleOf(spaceState(), NADIA_VIEWER, 'edit')).toBeNull();
  });

  it('fails closed on a visibility it does not know', () => {
    const unexpected: SpaceState = spaceState({
      visibility: 'shared' as SpaceState['visibility'],
      ownerUserId: HUGO,
    });

    expect(spaceRoleOf(unexpected, LEA_VIEWER, null)).toBeNull();
    expect(spaceRoleOf(unexpected, HUGO_VIEWER, null)).toBe('edit');
  });
});

describe('canSeeSpace: a role on the space, or a grant of one of its lists', () => {
  it('shows a space of the organization to every member and hides it from a guest without grants', () => {
    expect(canSeeSpace(spaceState(), LEA_VIEWER, { space: null, anyList: false })).toBe(true);
    expect(canSeeSpace(spaceState(), NADIA_VIEWER, { space: null, anyList: false })).toBe(false);
  });

  it('shows a private space to its owner and its grantees only, not to the owner or admins of the organization', () => {
    expect(canSeeSpace(designState(), HUGO_VIEWER, { space: null, anyList: false })).toBe(true);
    expect(canSeeSpace(designState(), LEA_VIEWER, { space: 'view', anyList: false })).toBe(true);
    expect(canSeeSpace(designState(), CAMILLE_VIEWER, { space: null, anyList: false })).toBe(false);
    expect(canSeeSpace(designState(), INES_VIEWER, { space: null, anyList: false })).toBe(false);
  });

  it('shows the space through the grant of one of its lists, to a guest and to a member', () => {
    expect(canSeeSpace(spaceState(), NADIA_VIEWER, { space: null, anyList: true })).toBe(true);
    expect(canSeeSpace(designState(), LEA_VIEWER, { space: null, anyList: true })).toBe(true);
  });
});

describe('canManageSpace: the owner of the space, or the owner or an admin of the organization for a space of the organization', () => {
  it('lets the owner of the space manage it, private or not', () => {
    expect(canManageSpace(designState(), HUGO_VIEWER)).toBe(true);
    expect(canManageSpace(spaceState({ ownerUserId: HUGO }), HUGO_VIEWER)).toBe(true);
  });

  it('lets the owner and the admins of the organization manage a space of the organization only', () => {
    const produit: SpaceState = spaceState({ ownerUserId: HUGO });

    expect(canManageSpace(produit, CAMILLE_VIEWER)).toBe(true);
    expect(canManageSpace(produit, INES_VIEWER)).toBe(true);
    expect(canManageSpace(designState(), CAMILLE_VIEWER)).toBe(false);
    expect(canManageSpace(designState(), INES_VIEWER)).toBe(false);
  });

  it('never lets a plain member who does not own it, nor a guest, manage a space', () => {
    expect(canManageSpace(spaceState({ ownerUserId: HUGO }), LEA_VIEWER)).toBe(false);
    expect(canManageSpace(designState({ ownerUserId: NADIA }), NADIA_VIEWER)).toBe(false);
  });
});

describe('canEdit and canCreateSpace', () => {
  it('lets edit change, and nothing else', () => {
    expect(canEdit('edit')).toBe(true);
    expect(canEdit('comment')).toBe(false);
    expect(canEdit('view')).toBe(false);
    expect(canEdit(null)).toBe(false);
  });

  it('lets every member but the guests create spaces', () => {
    expect(canCreateSpace(LEA_VIEWER)).toBe(true);
    expect(canCreateSpace(NADIA_VIEWER)).toBe(false);
  });
});

describe('listRoleOf: properties of the matrix', () => {
  test.prop([
    fc.constantFrom(...memberRoles),
    fc.constantFrom<SpaceState['visibility']>('organization', 'private'),
    fc.boolean(),
    fc.boolean(),
    fc.constantFrom<AccessRole | null>(null, ...roles),
    fc.constantFrom<AccessRole | null>(null, ...roles),
  ])(
    'is never lower than the list grant, and a guest gets exactly the list grant',
    (role, visibility, owns, switchOn, spaceGrant, listGrant) => {
      const viewer: Viewer = { userId: LEA, role };
      const space: SpaceState = spaceState({ visibility, ownerUserId: owns ? LEA : CAMILLE });
      const list = sprintState({ organizationAccess: switchOn });
      const effective: AccessRole | null = listRoleOf(space, list, viewer, {
        space: spaceGrant,
        list: listGrant,
      });

      expect(highestRole([effective, listGrant])).toBe(effective);
      if (role === 'guest') {
        expect(effective).toBe(listGrant);
      }
      if (role !== 'guest' && (owns || (visibility === 'organization' && switchOn))) {
        expect(effective).toBe('edit');
      }
      if (role !== 'guest' && effective === null) {
        expect(spaceGrant).toBeNull();
      }
    },
  );
});

describe('canManageListAccess: whoever has edit on a list shares it and answers its requests', () => {
  it.each([
    ['edit', true],
    ['comment', false],
    ['view', false],
    [null, false],
  ] as const)('answers %s with %s', (role: AccessRole | null, expected: boolean) => {
    expect(canManageListAccess(role)).toBe(expected);
  });
});

describe('isHighestRole: no source raises edit, so a reading of the grants can stop there', () => {
  it.each([
    ['edit', true],
    ['comment', false],
    ['view', false],
    [null, false],
  ] as const)('answers %s with %s', (role: AccessRole | null, expected: boolean) => {
    expect(isHighestRole(role)).toBe(expected);
  });

  test.prop([fc.constantFrom<AccessRole | null>('edit', 'comment', 'view', null)])(
    'is the role no other role ranks above',
    (role: AccessRole | null) => {
      expect(isHighestRole(role)).toBe(highestRole([role, 'edit']) === role);
    },
  );
});

describe('the policies fail closed on a tombstone ("Deletion" of lists.yaml and spaces.yaml)', () => {
  /** A deleted space "Produit". */
  const DELETED_SPACE: SpaceState = spaceState({
    deletedAt: DELETED_AT,
    deletedBy: { type: 'user', id: CAMILLE },
  });

  /** Sprint 14, deleted on its own. */
  const DELETED_LIST = sprintState({
    deletedAt: DELETED_AT,
    deletedBy: { type: 'user', id: CAMILLE },
  });

  it('gives nobody a role on a deleted space, its owner and the admins included', () => {
    for (const viewer of [CAMILLE_VIEWER, INES_VIEWER, HUGO_VIEWER]) {
      expect(spaceRoleOf(DELETED_SPACE, viewer, 'edit')).toBeNull();
    }
  });

  it('lets nobody see or manage a deleted space, a grant of one of its lists included', () => {
    expect(canSeeSpace(DELETED_SPACE, CAMILLE_VIEWER, { space: 'edit', anyList: true })).toBe(
      false,
    );
    expect(canManageSpace(DELETED_SPACE, CAMILLE_VIEWER)).toBe(false);
  });

  it('gives nobody a role on a deleted list, nor on a list of a deleted space, whatever the grants', () => {
    const grants: ListGrants = { space: 'edit', list: 'edit' };

    expect(listRoleOf(spaceState(), DELETED_LIST, CAMILLE_VIEWER, grants)).toBeNull();
    expect(listRoleOf(DELETED_SPACE, SWITCH_ON, CAMILLE_VIEWER, grants)).toBeNull();
    expect(listRoleOf(DELETED_SPACE, SWITCH_ON, NADIA_VIEWER, grants)).toBeNull();
  });
});

describe('listRoleAsIfNotDeletedOf: the trash reads the role a member would have ("Who" of trash.yaml)', () => {
  /** A deleted private space "Design" of Hugo Dubois. */
  const DELETED_DESIGN: SpaceState = designState({
    deletedAt: DELETED_AT,
    deletedBy: { type: 'user', id: HUGO },
  });

  it('gives the role of a live list to a deleted one and to a list of a deleted space', () => {
    expect(listRoleAsIfNotDeletedOf(DELETED_DESIGN, SWITCH_ON, HUGO_VIEWER, NONE)).toBe('edit');
    expect(listRoleAsIfNotDeletedOf(DELETED_DESIGN, SWITCH_ON, LEA_VIEWER, NONE)).toBeNull();
    expect(
      listRoleAsIfNotDeletedOf(DELETED_DESIGN, SWITCH_ON, LEA_VIEWER, {
        space: 'view',
        list: null,
      }),
    ).toBe('view');
    expect(
      listRoleAsIfNotDeletedOf(DELETED_DESIGN, SWITCH_ON, NADIA_VIEWER, {
        space: null,
        list: 'edit',
      }),
    ).toBe('edit');
  });

  it('gives nobody a role in a space awaiting an owner, deleted or not', () => {
    expect(
      listRoleAsIfNotDeletedOf(designState({ awaitingOwner: true }), SWITCH_ON, HUGO_VIEWER, {
        space: null,
        list: 'edit',
      }),
    ).toBeNull();
  });

  test.prop([
    fc.constantFrom(...memberRoles),
    fc.constantFrom<AccessRole | null>(null, ...roles),
    fc.constantFrom<AccessRole | null>(null, ...roles),
    fc.boolean(),
  ])(
    'equals listRoleOf on a list and a space that are not deleted',
    (
      role: MemberRole,
      spaceGrant: AccessRole | null,
      listGrant: AccessRole | null,
      on: boolean,
    ) => {
      const viewer: Viewer = { userId: LEA, role };
      const list = sprintState({ organizationAccess: on });
      const grants: ListGrants = { space: spaceGrant, list: listGrant };

      expect(listRoleAsIfNotDeletedOf(spaceState(), list, viewer, grants)).toBe(
        listRoleOf(spaceState(), list, viewer, grants),
      );
    },
  );
});
