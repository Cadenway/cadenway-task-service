import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import { DrizzleTaskListRepository } from './drizzle-task-list.repository.js';

/** The organization of the statements. */
const ORGANIZATION = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The viewer of the statements, Léa Petit. */
const LEA = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b33';

/**
 * Builds the repository on a client that records each statement and answers no row.
 *
 * @returns The repository and the statements it sent.
 */
function capturing(): {
  readonly lists: DrizzleTaskListRepository;
  readonly texts: string[];
  readonly values: unknown[][];
} {
  const texts: string[] = [];
  const values: unknown[][] = [];
  const client = {
    query: (
      config: { readonly text: string },
      params: unknown[] | undefined,
    ): Promise<{ rows: unknown[]; fields: unknown[] }> => {
      texts.push(config.text);
      values.push(params ?? []);
      return Promise.resolve({ rows: [], fields: [] });
    },
  };
  return {
    lists: new DrizzleTaskListRepository(drizzle(client as unknown as Pool)),
    texts,
    values,
  };
}

/**
 * Counts the occurrences of a text.
 *
 * @param text - Where to count.
 * @param part - What to count.
 * @returns The count.
 */
function count(text: string, part: string): number {
  return text.split(part).length - 1;
}

describe('DrizzleTaskListRepository: the collections read each grant of the viewer once, by join', () => {
  it('reads the lists of the sidebar in one statement with two left joins on the primary keys', async () => {
    const { lists, texts } = capturing();

    await lists.listFirstVisibleTo(ORGANIZATION, { userId: LEA, role: 'member' }, 20);

    expect(texts).toHaveLength(1);
    const text: string = texts[0] ?? '';
    expect(text).toContain(
      'left join "space_grants" "viewer_space_grant" on "viewer_space_grant"."organization_id" = $1 and "viewer_space_grant"."space_id" = "spaces"."id" and "viewer_space_grant"."user_id" = $2',
    );
    expect(text).toContain(
      'left join "list_grants" "viewer_list_grant" on "viewer_list_grant"."organization_id" = $3 and "viewer_list_grant"."list_id" = "lists"."id" and "viewer_list_grant"."user_id" = $4',
    );
    expect(count(text, '"list_grants"')).toBe(1);
    expect(count(text, '"space_grants"')).toBe(1);
    expect(text).not.toContain('(select');
  });

  it('reads the lean rows of the roles without the name, the look or the sprint of the lists', async () => {
    const { lists, texts } = capturing();

    await lists.listAccessesVisibleTo(ORGANIZATION, { userId: LEA, role: 'guest' });

    const text: string = texts[0] ?? '';
    expect(text).toContain('"lists"."organization_access"');
    expect(text).not.toContain('"lists"."name"');
    expect(text).not.toContain('"lists"."sprint_goal"');
    expect(count(text, '"list_grants"')).toBe(1);
    expect(text).toContain('"viewer_list_grant"."role" is not null');
  });

  it('applies the same joins to the lists of one space and to the sprints under way', async () => {
    const { lists, texts } = capturing();

    await lists.listAllOfSpaceVisibleTo(ORGANIZATION, '019a7000-0000-7000-8000-000000000001', {
      userId: LEA,
      role: 'member',
    });
    await lists.listCurrentSprintsVisibleTo(
      ORGANIZATION,
      { userId: LEA, role: 'member' },
      '2026-11-08',
      10,
    );

    for (const text of texts) {
      expect(text).toContain('left join "list_grants" "viewer_list_grant"');
      expect(text).toContain('left join "space_grants" "viewer_space_grant"');
      expect(text).not.toContain('(select');
    }
  });
});

/** The position of a list in its space, as the statements order by it. */
const POSITION = 'coalesce("lists"."restored_at", "lists"."created_at")';

/** The position of a space in the sidebar, as the statements order by it. */
const SPACE_POSITION = 'coalesce("spaces"."restored_at", "spaces"."created_at")';

/** The condition of the live lists. */
const LIVE = '"lists"."archived_at" is null';

describe('DrizzleTaskListRepository: the collections of a space, of the sprints and of the sidebar keep the live lists', () => {
  it('leaves the archived lists out of the lists of a space and orders them by their position', async () => {
    const { lists, texts } = capturing();

    await lists.listOfSpaceVisibleTo(
      ORGANIZATION,
      '019a7000-0000-7000-8000-000000000001',
      { userId: LEA, role: 'member' },
      null,
      51,
    );
    await lists.listAllOfSpaceVisibleTo(ORGANIZATION, '019a7000-0000-7000-8000-000000000001', {
      userId: LEA,
      role: 'member',
    });

    for (const text of texts) {
      expect(text).toContain(LIVE);
      expect(text).toContain(`order by ${POSITION} asc, "lists"."id" asc`);
    }
  });

  it('continues the lists of a space after the position of the last list of the previous page', async () => {
    const { lists, texts, values } = capturing();

    await lists.listOfSpaceVisibleTo(
      ORGANIZATION,
      '019a7000-0000-7000-8000-000000000001',
      { userId: LEA, role: 'member' },
      {
        createdAt: new Date('2026-11-08T17:00:00.000Z'),
        id: '019a7100-0000-7000-8000-000000000001',
      },
      51,
    );

    expect(texts[0]).toMatch(
      /\(coalesce\("lists"\."restored_at", "lists"\."created_at"\), "lists"\."id"\) > \(\$\d+::timestamptz, \$\d+::uuid\)/u,
    );
    expect(values[0]).toContain('2026-11-08T17:00:00.000Z');
  });

  it('leaves the archived sprints out of the sprints under way, in the order of their last day then creation', async () => {
    const { lists, texts } = capturing();

    await lists.listCurrentSprintsVisibleTo(
      ORGANIZATION,
      { userId: LEA, role: 'member' },
      '2026-11-08',
      10,
    );

    expect(texts[0]).toContain(LIVE);
    expect(texts[0]).toContain(
      'order by "lists"."sprint_end_date" asc, "lists"."created_at" asc, "lists"."id" asc',
    );
  });

  it('leaves the archived lists out of the sidebar, the spaces then the lists of each by their position', async () => {
    const { lists, texts } = capturing();

    await lists.listFirstVisibleTo(ORGANIZATION, { userId: LEA, role: 'member' }, 6);

    expect(texts[0]).toContain(LIVE);
    expect(texts[0]).toContain(
      `order by ${SPACE_POSITION} asc, "spaces"."id" asc, ${POSITION} asc, "lists"."id" asc`,
    );
  });

  it('keeps the archived lists in the lean rows of the roles, in sidebar order', async () => {
    const { lists, texts } = capturing();

    await lists.listAccessesVisibleTo(ORGANIZATION, { userId: LEA, role: 'member' });

    expect(texts[0]).not.toContain('"archived_at"');
    expect(texts[0]).toContain(
      `order by ${SPACE_POSITION} asc, "spaces"."id" asc, ${POSITION} asc, "lists"."id" asc`,
    );
  });
});

describe('DrizzleTaskListRepository: the archives and the lists read by id', () => {
  it('reads a page of the archived lists the latest first, after a position, with the joins of the collections', async () => {
    const { lists, texts, values } = capturing();

    await lists.listArchivedVisibleTo(
      ORGANIZATION,
      { userId: LEA, role: 'member' },
      {
        archivedAt: new Date('2026-11-05T09:00:00.000Z'),
        id: '019a7100-0000-7000-8000-000000000004',
      },
      50,
    );

    const text: string = texts[0] ?? '';
    expect(text).toContain('"lists"."archived_at" is not null');
    expect(text).toContain('("lists"."archived_at", "lists"."id") < ($');
    expect(text).toContain('order by "lists"."archived_at" desc, "lists"."id" desc');
    expect(text).toContain('left join "list_grants" "viewer_list_grant"');
    expect(values[0]).toContain('2026-11-05T09:00:00.000Z');
  });

  it('counts the archived lists with the same condition, in one statement', async () => {
    const { lists, texts } = capturing();

    const total: number = await lists.countArchivedVisibleTo(ORGANIZATION, {
      userId: LEA,
      role: 'guest',
    });

    expect(total).toBe(0);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('count(*)::int');
    expect(texts[0]).toContain('"lists"."archived_at" is not null');
    expect(texts[0]).toContain('"viewer_list_grant"."role" is not null');
  });

  it('reads some lists by id, archived ones included, and nothing without an id', async () => {
    const { lists, texts } = capturing();

    await lists.listVisibleByIds(ORGANIZATION, { userId: LEA, role: 'member' }, []);
    await lists.listVisibleByIds(ORGANIZATION, { userId: LEA, role: 'member' }, [
      '019a7100-0000-7000-8000-000000000001',
      '019a7100-0000-7000-8000-000000000002',
    ]);

    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('"lists"."id" in ($');
    expect(texts[0]).not.toContain('"archived_at" is');
  });
});

describe('DrizzleTaskListRepository: a tombstone answers as an unknown list, but to the trash', () => {
  /** The condition that leaves the tombstones out. */
  const UNDELETED = '"lists"."deleted_at" is null';

  it('leaves the tombstones out of a reading by id and of a lock before a change', async () => {
    const { lists, texts } = capturing();

    await lists.find(ORGANIZATION, '019a7100-0000-7000-8000-000000000002');
    await lists.lock(ORGANIZATION, '019a7100-0000-7000-8000-000000000002');

    expect(texts[0]).toContain(UNDELETED);
    expect(texts[1]).toContain(UNDELETED);
    expect(texts[1]?.endsWith('for no key update')).toBe(true);
  });

  it('leaves the tombstones and the lists of a deleted space out of every collection', async () => {
    const { lists, texts } = capturing();

    await lists.listFirstVisibleTo(ORGANIZATION, { userId: LEA, role: 'member' }, 6);
    await lists.listAccessesVisibleTo(ORGANIZATION, { userId: LEA, role: 'guest' });
    await lists.listVisibleByIds(ORGANIZATION, { userId: LEA, role: 'member' }, [
      '019a7100-0000-7000-8000-000000000002',
    ]);

    for (const text of texts) {
      expect(text).toContain(`(${UNDELETED} and "spaces"."deleted_at" is null and (`);
    }
  });

  it('locks the lists of the clean-up of a member, deleted ones included', async () => {
    const { lists, texts } = capturing();

    await lists.lockMany(ORGANIZATION, ['019a7100-0000-7000-8000-000000000002']);

    expect(texts[0]).not.toContain('deleted_at" is');
    expect(texts[0]?.endsWith('order by "lists"."id" asc for no key update')).toBe(true);
  });

  it('locks several lists for an erasure in one statement in ascending id, for update', async () => {
    const { lists, texts } = capturing();

    await lists.lockMany(
      ORGANIZATION,
      ['019a7100-0000-7000-8000-000000000002', '019a7100-0000-7000-8000-000000000001'],
      'delete',
    );

    expect(texts).toHaveLength(1);
    expect(texts[0]).not.toContain('deleted_at" is');
    expect(texts[0]?.endsWith('order by "lists"."id" asc for update')).toBe(true);
  });

  it('reads several lists in any state in one statement without lock, and nothing for no id', async () => {
    const { lists, texts } = capturing();

    await lists.findManyIncludingDeleted(ORGANIZATION, []);
    await lists.findManyIncludingDeleted(ORGANIZATION, ['019a7100-0000-7000-8000-000000000002']);

    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('"lists"."id" in ($');
    expect(texts[0]).not.toContain('deleted_at" is');
    expect(texts[0]).not.toContain(' for ');
  });

  it('locks the lists of a space being deleted in one statement in ascending id, tombstones left out', async () => {
    const { lists, texts } = capturing();

    const locked: string[] = await lists.lockUndeletedOfSpace(
      ORGANIZATION,
      '019a7000-0000-7000-8000-000000000001',
    );

    expect(locked).toEqual([]);
    expect(texts).toHaveLength(1);
    expect(texts[0]?.startsWith('select "id" from "lists"')).toBe(true);
    expect(texts[0]).toContain('"lists"."space_id" = $');
    expect(texts[0]).toContain(UNDELETED);
    expect(texts[0]?.endsWith('order by "lists"."id" asc for no key update')).toBe(true);
  });

  it('reads and locks a list in any state for the trash, in the lock mode asked', async () => {
    const { lists, texts } = capturing();

    await lists.findIncludingDeleted(ORGANIZATION, '019a7100-0000-7000-8000-000000000002');
    await lists.lockIncludingDeleted(ORGANIZATION, '019a7100-0000-7000-8000-000000000002', 'share');
    await lists.lockIncludingDeleted(
      ORGANIZATION,
      '019a7100-0000-7000-8000-000000000002',
      'update',
    );
    await lists.lockIncludingDeleted(
      ORGANIZATION,
      '019a7100-0000-7000-8000-000000000002',
      'delete',
    );

    for (const text of texts) {
      expect(text).not.toContain('deleted_at" is');
    }
    expect(texts[0]).not.toContain(' for ');
    expect(texts[1]?.endsWith('for share')).toBe(true);
    expect(texts[2]?.endsWith('for no key update')).toBe(true);
    expect(texts[3]?.endsWith('for update')).toBe(true);
  });

  it('deletes the lists of a deleted space in one statement, at their versions, skipping the tombstones', async () => {
    const { lists, texts, values } = capturing();

    const marked: number = await lists.markDeletedWithSpace(
      ORGANIZATION,
      '019a7000-0000-7000-8000-000000000001',
      { type: 'user', id: LEA },
      new Date('2026-11-08T16:10:00.000Z'),
    );

    expect(marked).toBe(0);
    expect(texts).toHaveLength(1);
    const text: string = texts[0] ?? '';
    expect(
      text.startsWith(
        'update "lists" set "deleted_at" = $1, "deleted_by_type" = $2, "deleted_by_id" = $3, "updated_at" = now()',
      ),
    ).toBe(true);
    expect(text).not.toContain('"version"');
    expect(text).toContain('"lists"."space_id" = $');
    expect(text).toContain(UNDELETED);
    expect(values[0]).toEqual(expect.arrayContaining(['user', LEA]));
  });

  it('reads the deleted lists of a space by id, and whether any list row of it is left', async () => {
    const { lists, texts } = capturing();

    await lists.listDeletedIdsOfSpace(ORGANIZATION, '019a7000-0000-7000-8000-000000000001');
    const any: boolean = await lists.anyOfSpace(
      ORGANIZATION,
      '019a7000-0000-7000-8000-000000000001',
    );

    expect(texts[0]).toContain('"lists"."deleted_at" is not null');
    expect(texts[0]).toContain('order by "lists"."id" asc');
    expect(texts[1]).not.toContain('deleted_at');
    expect(texts[1]).toContain('limit $');
    expect(any).toBe(false);
  });

  it('erases a tombstone only, by its primary key', async () => {
    const { lists, texts } = capturing();

    await expect(lists.erase(ORGANIZATION, '019a7100-0000-7000-8000-000000000002')).rejects.toThrow(
      'The deleted list to erase is not a tombstone.',
    );

    expect(texts[0]?.startsWith('delete from "lists"')).toBe(true);
    expect(texts[0]).toContain('"lists"."deleted_at" is not null');
  });

  it('reads the trash rows with the role as if not deleted: no tombstone condition, lean columns', async () => {
    const { lists, texts } = capturing();

    await lists.listTrashAccessesVisibleTo(ORGANIZATION, { userId: LEA, role: 'member' });
    const found = await lists.findTrashAccessVisibleTo(
      ORGANIZATION,
      { userId: LEA, role: 'member' },
      '019a7100-0000-7000-8000-000000000002',
    );

    expect(found).toBeNull();
    for (const text of texts) {
      expect(text).not.toContain(UNDELETED);
      expect(text).not.toContain('"spaces"."deleted_at" is null');
      expect(text).toContain('"lists"."name"');
      expect(text).toContain('"lists"."deleted_at"');
      expect(text).toContain('"spaces"."deleted_at"');
      expect(text).not.toContain('"lists"."sprint_goal"');
      expect(text).toContain('left join "list_grants" "viewer_list_grant"');
      expect(text).toContain('"viewer_list_grant"."role" is not null');
    }
    expect(texts[0]).not.toContain('order by');
    expect(texts[1]).toContain('"lists"."id" = $');
  });
});

describe('DrizzleTaskListRepository: an update writes the archive of the list', () => {
  it('sets the archive columns and the restoration with the version', async () => {
    const { lists, texts, values } = capturing();
    const list = TaskList.restore({
      id: '019a7100-0000-7000-8000-000000000002',
      organizationId: ORGANIZATION,
      spaceId: '019a7000-0000-7000-8000-000000000001',
      name: 'Sprint 14',
      icon: null,
      color: 'indigo',
      sprint: null,
      organizationAccess: true,
      createdAt: new Date('2026-10-20T09:00:00Z'),
      archivedAt: new Date('2026-11-03T09:00:00.000Z'),
      archivedBy: { type: 'user', id: LEA },
      restoredAt: null,
      deletedAt: null,
      deletedBy: null,
      version: 4,
    });

    await expect(lists.update(list)).rejects.toThrow('The list vanished while it was locked.');

    const text: string = texts[0] ?? '';
    expect(text).toContain('"archived_at" = $');
    expect(text).toContain('"archived_by_type" = $');
    expect(text).toContain('"archived_by_id" = $');
    expect(text).toContain('"restored_at" = $');
    expect(values[0]).toEqual(expect.arrayContaining(['user', LEA, 4]));
  });

  it('sets the tombstone columns with the version', async () => {
    const { lists, texts, values } = capturing();
    const list = TaskList.restore({
      id: '019a7100-0000-7000-8000-000000000002',
      organizationId: ORGANIZATION,
      spaceId: '019a7000-0000-7000-8000-000000000001',
      name: 'Sprint 14',
      icon: null,
      color: 'indigo',
      sprint: null,
      organizationAccess: true,
      createdAt: new Date('2026-10-20T09:00:00Z'),
      archivedAt: null,
      archivedBy: null,
      restoredAt: null,
      deletedAt: new Date('2026-11-08T16:10:00.000Z'),
      deletedBy: { type: 'automation', id: 'rule-7' },
      version: 5,
    });

    await expect(lists.update(list)).rejects.toThrow('The list vanished while it was locked.');

    const text: string = texts[0] ?? '';
    expect(text).toContain('"deleted_at" = $');
    expect(text).toContain('"deleted_by_type" = $');
    expect(text).toContain('"deleted_by_id" = $');
    expect(values[0]).toEqual(expect.arrayContaining(['automation', 'rule-7', 5]));
  });
});

describe('DrizzleTaskListRepository: lockShared holds a list that is not deleted for share', () => {
  it('reads the list by id, tombstones left out, for share', async () => {
    const { lists, texts } = capturing();

    await lists.lockShared(ORGANIZATION, '019a7100-0000-7000-8000-000000000002');

    expect(texts[0]).toContain('"lists"."deleted_at" is null');
    expect(texts[0]?.endsWith('for share')).toBe(true);
  });
});
