import { describe, expect, it } from 'vitest';

import { ARCHIVED_AT, DELETED_AT } from '../../spaces.fixture.js';
import { announcesChanges, listStateOf } from './list-state.policy.js';

describe('listStateOf: where a list stands, as the trash and the archives name it', () => {
  it('reads active for a live list of a live space', () => {
    expect(listStateOf({ archivedAt: null, deletedAt: null }, { deletedAt: null })).toBe('active');
  });

  it('reads archived for an archived list of a live space', () => {
    expect(listStateOf({ archivedAt: ARCHIVED_AT, deletedAt: null }, { deletedAt: null })).toBe(
      'archived',
    );
  });

  it('reads deleted for a deleted list, archived or not', () => {
    expect(listStateOf({ archivedAt: null, deletedAt: DELETED_AT }, { deletedAt: null })).toBe(
      'deleted',
    );
    expect(
      listStateOf({ archivedAt: ARCHIVED_AT, deletedAt: DELETED_AT }, { deletedAt: null }),
    ).toBe('deleted');
  });

  it('reads deleted for any list of a deleted space', () => {
    expect(
      listStateOf({ archivedAt: ARCHIVED_AT, deletedAt: null }, { deletedAt: DELETED_AT }),
    ).toBe('deleted');
  });
});

describe('announcesChanges: a tombstone emits no content event until it comes back from the trash', () => {
  it('announces a change of a live space, and of a live or archived list of it', () => {
    expect(announcesChanges('content', { deletedAt: null })).toBe(true);
    expect(
      announcesChanges('content', { deletedAt: null }, { archivedAt: null, deletedAt: null }),
    ).toBe(true);
    expect(
      announcesChanges(
        'content',
        { deletedAt: null },
        { archivedAt: ARCHIVED_AT, deletedAt: null },
      ),
    ).toBe(true);
  });

  it('announces nothing of a deleted space, nor of any list of it', () => {
    expect(announcesChanges('content', { deletedAt: DELETED_AT })).toBe(false);
    expect(
      announcesChanges('content', { deletedAt: DELETED_AT }, { archivedAt: null, deletedAt: null }),
    ).toBe(false);
  });

  it('announces nothing of a deleted list, archived or not, in a live space', () => {
    expect(
      announcesChanges('content', { deletedAt: null }, { archivedAt: null, deletedAt: DELETED_AT }),
    ).toBe(false);
    expect(
      announcesChanges(
        'content',
        { deletedAt: null },
        { archivedAt: ARCHIVED_AT, deletedAt: DELETED_AT },
      ),
    ).toBe(false);
  });
});

describe('announcesChanges: an access change is announced, tombstones included, so who reaches what converges', () => {
  it('announces an access change of a live space, and of a live or archived list of it', () => {
    expect(announcesChanges('access', { deletedAt: null })).toBe(true);
    expect(
      announcesChanges('access', { deletedAt: null }, { archivedAt: null, deletedAt: null }),
    ).toBe(true);
    expect(
      announcesChanges('access', { deletedAt: null }, { archivedAt: ARCHIVED_AT, deletedAt: null }),
    ).toBe(true);
  });

  it('announces an access change of a deleted space, and of any list of it', () => {
    expect(announcesChanges('access', { deletedAt: DELETED_AT })).toBe(true);
    expect(
      announcesChanges('access', { deletedAt: DELETED_AT }, { archivedAt: null, deletedAt: null }),
    ).toBe(true);
  });

  it('announces an access change of a deleted list, archived or not, in a live space', () => {
    expect(
      announcesChanges('access', { deletedAt: null }, { archivedAt: null, deletedAt: DELETED_AT }),
    ).toBe(true);
    expect(
      announcesChanges(
        'access',
        { deletedAt: null },
        { archivedAt: ARCHIVED_AT, deletedAt: DELETED_AT },
      ),
    ).toBe(true);
  });
});
