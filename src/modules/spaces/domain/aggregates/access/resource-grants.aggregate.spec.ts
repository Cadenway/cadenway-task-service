import { describe, expect, it } from 'vitest';

import { GrantLimitReachedError } from '../../errors/access/grant-limit-reached.error.js';
import { GranteeInvalidError } from '../../errors/access/grantee-invalid.error.js';
import { GuestSpaceForbiddenError } from '../../errors/access/guest-space-forbidden.error.js';
import { OwnerUnchangeableError } from '../../errors/access/owner-unchangeable.error.js';
import { InvalidSpaceError } from '../../errors/space/invalid-space.error.js';
import { CAMILLE, HUGO, INES, LEA, NADIA } from '../../spaces.fixture.js';
import type { AccessRole } from '../../value-objects/access/access-role.value-object.js';
import type { GrantEntry } from '../../value-objects/access/grant-entry.value-object.js';
import type { GrantResource } from '../../value-objects/access/grant-resource.value-object.js';
import type { GrantsUpdate } from '../../value-objects/access/grants-update.value-object.js';
import { GRANT_LIMIT, ResourceGrants } from './resource-grants.aggregate.js';

/**
 * The grants of "Sprint 14" in the mockup: Inès Robert and Hugo Dubois edit, Léa Petit comments;
 * Camille Martin owns the space.
 *
 * @param resource - A space or a list.
 * @param grants - The grants, those of the mockup by default.
 * @returns The grants.
 */
function sprint14Grants(
  resource: GrantResource = 'list',
  grants: readonly GrantEntry[] = [
    { userId: INES, role: 'edit' },
    { userId: HUGO, role: 'edit' },
    { userId: LEA, role: 'comment' },
  ],
): ResourceGrants {
  return ResourceGrants.restore({ resource, ownerUserId: CAMILLE, grants });
}

/**
 * Builds `count` grants of made-up accounts.
 *
 * @param count - How many.
 * @returns The grants.
 */
function manyGrants(count: number): GrantEntry[] {
  return Array.from({ length: count }, (_value: unknown, index: number): GrantEntry => ({
    userId: `019a6f00-0000-7000-8000-${String(index).padStart(12, '0')}`,
    role: 'view',
  }));
}

describe('ResourceGrants.give: a person receives a role, or another one', () => {
  it('adds the guest Nadia Benali after the others on the list, with comment', () => {
    const update: GrantsUpdate = sprint14Grants().give({
      userId: NADIA,
      role: 'comment',
      granteeRole: 'guest',
    });

    expect(update.changed).toBe(true);
    expect(update.role).toBe('comment');
    expect(update.grants.snapshot.grants.map((grant: GrantEntry) => grant.userId)).toEqual([
      INES,
      HUGO,
      LEA,
      NADIA,
    ]);
  });

  it('replaces the role in place, lower or higher, keeping the order', () => {
    const lowered: GrantsUpdate = sprint14Grants().give({
      userId: INES,
      role: 'view',
      granteeRole: 'admin',
    });

    expect(lowered.changed).toBe(true);
    expect(lowered.grants.snapshot.grants[0]).toEqual({ userId: INES, role: 'view' });
  });

  it('changes nothing for the same role again', () => {
    const grants: ResourceGrants = sprint14Grants();
    const update: GrantsUpdate = grants.give({
      userId: LEA,
      role: 'comment',
      granteeRole: 'member',
    });

    expect(update).toEqual({ grants, changed: false, role: 'comment' });
  });

  it('refuses someone the copy does not hold as a member, naming the account', () => {
    let refused: unknown;
    try {
      sprint14Grants().give({ userId: NADIA, role: 'view', granteeRole: null });
    } catch (error: unknown) {
      refused = error;
    }

    expect(refused).toBeInstanceOf(GranteeInvalidError);
    expect((refused as GranteeInvalidError).userId).toBe(NADIA);
  });

  it('refuses the owner of the space, who always has edit', () => {
    expect(() =>
      sprint14Grants().give({ userId: CAMILLE, role: 'view', granteeRole: 'owner' }),
    ).toThrow(OwnerUnchangeableError);
  });

  it('refuses a guest on a space and lets the same guest receive a list', () => {
    expect(() =>
      sprint14Grants('space').give({ userId: NADIA, role: 'view', granteeRole: 'guest' }),
    ).toThrow(GuestSpaceForbiddenError);
    expect(
      sprint14Grants('list').give({ userId: NADIA, role: 'view', granteeRole: 'guest' }).changed,
    ).toBe(true);
  });

  it('refuses a 201st grant and still changes the role of someone among the 200', () => {
    const full: ResourceGrants = sprint14Grants('space', manyGrants(GRANT_LIMIT));

    expect(() => full.give({ userId: LEA, role: 'view', granteeRole: 'member' })).toThrow(
      GrantLimitReachedError,
    );
    const first: string = manyGrants(1)[0]?.userId ?? '';
    expect(full.give({ userId: first, role: 'edit', granteeRole: 'member' }).changed).toBe(true);
  });

  it('checks who the person is before the limit', () => {
    const full: ResourceGrants = sprint14Grants('space', manyGrants(GRANT_LIMIT));

    expect(() => full.give({ userId: NADIA, role: 'view', granteeRole: null })).toThrow(
      GranteeInvalidError,
    );
  });
});

describe('ResourceGrants.raise: an approval creates or raises a grant, never lowers it', () => {
  it.each<[AccessRole, AccessRole, AccessRole, boolean]>([
    ['view', 'edit', 'edit', true],
    ['comment', 'view', 'comment', false],
    ['edit', 'edit', 'edit', false],
  ])('turns %s into %s as %s', (held, asked, after, changed) => {
    const update: GrantsUpdate = sprint14Grants('list', [{ userId: LEA, role: held }]).raise({
      userId: LEA,
      role: asked,
      granteeRole: 'member',
    });

    expect(update.role).toBe(after);
    expect(update.changed).toBe(changed);
  });

  it('applies the same refusals as a grant', () => {
    expect(() =>
      sprint14Grants('space').raise({ userId: NADIA, role: 'view', granteeRole: 'guest' }),
    ).toThrow(GuestSpaceForbiddenError);
    expect(() =>
      sprint14Grants().raise({ userId: CAMILLE, role: 'view', granteeRole: 'owner' }),
    ).toThrow(OwnerUnchangeableError);
  });
});

describe('ResourceGrants.remove and revoke: a person loses their grant', () => {
  it('removes the grant of Léa Petit and keeps the others in order', () => {
    const update: GrantsUpdate = sprint14Grants().remove(LEA);

    expect(update.changed).toBe(true);
    expect(update.role).toBeNull();
    expect(update.grants.snapshot.grants).toEqual([
      { userId: INES, role: 'edit' },
      { userId: HUGO, role: 'edit' },
    ]);
  });

  it('changes nothing for a person without a grant', () => {
    const grants: ResourceGrants = sprint14Grants();

    expect(grants.remove(NADIA)).toEqual({ grants, changed: false, role: null });
  });

  it('refuses the owner of the space, with or without a grant', () => {
    expect(() => sprint14Grants().remove(CAMILLE)).toThrow(OwnerUnchangeableError);
  });

  it('revokes the grant of a former member without refusing anything', () => {
    expect(sprint14Grants().revoke(HUGO).changed).toBe(true);
    expect(sprint14Grants().revoke(CAMILLE).changed).toBe(false);
  });
});

describe('ResourceGrants.restore: the stored grants keep the rules', () => {
  it('refuses two grants of one person, an unknown role and a grant of the owner', () => {
    expect(() =>
      sprint14Grants('list', [
        { userId: LEA, role: 'view' },
        { userId: LEA, role: 'edit' },
      ]),
    ).toThrow(InvalidSpaceError);
    expect(() => sprint14Grants('list', [{ userId: LEA, role: 'owner' as AccessRole }])).toThrow(
      InvalidSpaceError,
    );
    expect(() => sprint14Grants('list', [{ userId: CAMILLE, role: 'edit' }])).toThrow(
      InvalidSpaceError,
    );
  });

  it('accepts more than 200 stored grants, so that a lower limit never locks a list', () => {
    expect(sprint14Grants('list', manyGrants(GRANT_LIMIT + 1)).snapshot.grants).toHaveLength(201);
  });
});
