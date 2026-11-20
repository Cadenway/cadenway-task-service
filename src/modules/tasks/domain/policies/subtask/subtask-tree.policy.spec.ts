import { describe, expect, it } from 'vitest';

import { ParentInvalidError } from '../../errors/subtask/parent-invalid.error.js';
import { SubtaskDepthExceededError } from '../../errors/subtask/subtask-depth-exceeded.error.js';
import { SubtaskLimitReachedError } from '../../errors/subtask/subtask-limit-reached.error.js';
import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { ListInvalidError } from '../../errors/task/list-invalid.error.js';
import {
  BUGS,
  CAD_482,
  CAD_483,
  CAD_484,
  CAD_490,
  SPRINT_14,
  cad482Parent,
} from '../../tasks.fixture.js';
import type { RestoredRootParent } from '../../value-objects/subtask/restored-root-parent.value-object.js';
import type { SubtaskParent } from '../../value-objects/subtask/subtask-parent.value-object.js';
import type { SubtreeShape } from '../../value-objects/subtask/subtree-shape.value-object.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import {
  treeHeight,
  checkAttachment,
  checkNewSubtask,
  depthsUnder,
  showsParent,
  takesRestoredRoot,
} from './subtask-tree.policy.js';

/** The key of CAD-490, the task that attaches. */
const cad490Key: TaskKey = TaskKey.of('CAD', 490);

/**
 * Builds the subtree of CAD-490.
 *
 * @param height - Its number of levels.
 * @param descendantIds - Its descendants.
 * @returns The subtree.
 */
function subtree(height: number, descendantIds: readonly string[] = []): SubtreeShape {
  return { taskId: CAD_490, descendantIds, height };
}

/**
 * Captures the error a check throws.
 *
 * @param check - The check.
 * @returns The error, or `undefined`.
 */
function errorOf(check: () => void): unknown {
  try {
    check();
  } catch (caught: unknown) {
    return caught;
  }
  return undefined;
}

describe('checkNewSubtask: 3 levels and 25 direct subtasks at most', () => {
  it('accepts a subtask under a level 1 or level 2 parent', () => {
    expect(() => {
      checkNewSubtask(cad482Parent({ level: 1 }));
    }).not.toThrow();
    expect(() => {
      checkNewSubtask(cad482Parent({ level: 2 }));
    }).not.toThrow();
  });

  it('refuses a subtask under a parent at the third level', () => {
    expect(() => {
      checkNewSubtask(cad482Parent({ level: 3 }));
    }).toThrow(SubtaskDepthExceededError);
  });

  it('accepts the 25th direct subtask and refuses the 26th', () => {
    expect(() => {
      checkNewSubtask(cad482Parent({ childCount: 24 }));
    }).not.toThrow();
    expect(() => {
      checkNewSubtask(cad482Parent({ childCount: 25 }));
    }).toThrow(SubtaskLimitReachedError);
    expect(() => {
      checkNewSubtask(cad482Parent({ childCount: 26 }));
    }).toThrow(SubtaskLimitReachedError);
  });

  it('answers the depth before the count', () => {
    expect(() => {
      checkNewSubtask(cad482Parent({ level: 3, childCount: 25 }));
    }).toThrow(SubtaskDepthExceededError);
  });

  it('refuses a shape no tree has', () => {
    expect(() => {
      checkNewSubtask(cad482Parent({ level: 0 }));
    }).toThrow(InvalidTaskError);
    expect(() => {
      checkNewSubtask(cad482Parent({ childCount: -1 }));
    }).toThrow(InvalidTaskError);
  });
});

describe('checkAttachment: the subtree fits within 3 levels under the parent', () => {
  it('accepts a parent level plus subtree height of 3', () => {
    expect(() => {
      checkAttachment(
        cad490Key,
        null,
        { parent: cad482Parent({ level: 1 }), subtree: subtree(2) },
        undefined,
      );
    }).not.toThrow();
    expect(() => {
      checkAttachment(
        cad490Key,
        null,
        { parent: cad482Parent({ level: 2 }), subtree: subtree(1) },
        undefined,
      );
    }).not.toThrow();
  });

  it('refuses a parent level plus subtree height of 4', () => {
    expect(() => {
      checkAttachment(
        cad490Key,
        null,
        { parent: cad482Parent({ level: 2 }), subtree: subtree(2) },
        undefined,
      );
    }).toThrow(SubtaskDepthExceededError);
    expect(() => {
      checkAttachment(
        cad490Key,
        null,
        { parent: cad482Parent({ level: 1 }), subtree: subtree(3) },
        undefined,
      );
    }).toThrow(SubtaskDepthExceededError);
  });

  it('accepts a parent with 24 subtasks and refuses one with 25 or 26', () => {
    expect(() => {
      checkAttachment(
        cad490Key,
        null,
        { parent: cad482Parent({ childCount: 24 }), subtree: subtree(1) },
        undefined,
      );
    }).not.toThrow();
    expect(() => {
      checkAttachment(
        cad490Key,
        null,
        { parent: cad482Parent({ childCount: 25 }), subtree: subtree(1) },
        undefined,
      );
    }).toThrow(SubtaskLimitReachedError);
    expect(() => {
      checkAttachment(
        cad490Key,
        null,
        { parent: cad482Parent({ childCount: 26 }), subtree: subtree(1) },
        undefined,
      );
    }).toThrow(SubtaskLimitReachedError);
  });
});

describe('checkAttachment: the parent is neither the task nor one of its descendants', () => {
  it('refuses the task itself, with its key', () => {
    const error: unknown = errorOf(() => {
      checkAttachment(
        cad490Key,
        null,
        {
          parent: { ...cad482Parent(), id: CAD_490, key: cad490Key },
          subtree: subtree(1),
        },
        undefined,
      );
    });

    expect(error).toBeInstanceOf(ParentInvalidError);
    expect((error as ParentInvalidError).parentKey).toBe('CAD-490');
  });

  it('refuses a descendant, at any level', () => {
    const parent: SubtaskParent = {
      ...cad482Parent({ level: 3 }),
      id: CAD_484,
      key: TaskKey.of('CAD', 484),
    };
    const error: unknown = errorOf(() => {
      checkAttachment(
        TaskKey.of('CAD', 482),
        null,
        { parent, subtree: { taskId: CAD_482, descendantIds: [CAD_483, CAD_484], height: 3 } },
        undefined,
      );
    });

    expect(error).toBeInstanceOf(ParentInvalidError);
    expect((error as ParentInvalidError).parentKey).toBe('CAD-484');
  });

  it('answers parent-invalid before list-invalid and the depth', () => {
    expect(() => {
      checkAttachment(
        cad490Key,
        null,
        {
          parent: { ...cad482Parent({ level: 3 }), id: CAD_490, key: cad490Key },
          subtree: subtree(1),
        },
        BUGS,
      );
    }).toThrow(ParentInvalidError);
  });
});

describe('checkAttachment: a listId in the same patch is the list of the parent', () => {
  it('accepts the list of the parent', () => {
    expect(() => {
      checkAttachment(cad490Key, null, { parent: cad482Parent(), subtree: subtree(1) }, SPRINT_14);
    }).not.toThrow();
  });

  it('refuses another list before the depth and the count', () => {
    expect(() => {
      checkAttachment(
        cad490Key,
        null,
        { parent: cad482Parent({ level: 3, childCount: 25 }), subtree: subtree(1) },
        BUGS,
      );
    }).toThrow(ListInvalidError);
  });

  it('checks only the list when the parent is already the parent', () => {
    expect(() => {
      checkAttachment(
        cad490Key,
        CAD_482,
        { parent: cad482Parent({ childCount: 25 }), subtree: subtree(1) },
        undefined,
      );
    }).not.toThrow();
    expect(() => {
      checkAttachment(cad490Key, CAD_482, { parent: cad482Parent(), subtree: subtree(1) }, BUGS);
    }).toThrow(ListInvalidError);
  });
});

/** The archive of CAD-483: CAD-483 under CAD-482, and its subtask CAD-484. */
const CAD_483_ARCHIVE: readonly { readonly id: string; readonly parentId: string | null }[] = [
  { id: CAD_484, parentId: CAD_483 },
  { id: CAD_483, parentId: CAD_482 },
];

/**
 * Builds the parent of a restored root: CAD-482, live, in Sprint 14, at level 1 with 2 live
 * subtasks unless replaced.
 *
 * @param overrides - Fields to replace.
 * @returns The parent.
 */
function restoredParent(overrides: Partial<RestoredRootParent> = {}): RestoredRootParent {
  return { live: true, listId: SPRINT_14, level: 1, childCount: 2, ...overrides };
}

describe('depthsUnder and treeHeight: the levels of an archive or a trash entry from its parent links', () => {
  it('gives the root depth 0 and each member its depth below, in any order', () => {
    expect([...depthsUnder(CAD_483, CAD_483_ARCHIVE).entries()]).toEqual([
      [CAD_484, 1],
      [CAD_483, 0],
    ]);
    expect(treeHeight(CAD_483, CAD_483_ARCHIVE)).toBe(2);
  });

  it('counts a root alone as one level and a full tree as three', () => {
    expect(treeHeight(CAD_490, [{ id: CAD_490, parentId: null }])).toBe(1);
    expect(
      treeHeight(CAD_482, [
        { id: CAD_482, parentId: null },
        { id: CAD_483, parentId: CAD_482 },
        { id: CAD_484, parentId: CAD_483 },
      ]),
    ).toBe(3);
  });

  it.each<[string, string, readonly { readonly id: string; readonly parentId: string | null }[]]>([
    ['a tree without its root', CAD_482, [{ id: CAD_483, parentId: CAD_482 }]],
    [
      'a member whose parent is outside the tree',
      CAD_483,
      [
        { id: CAD_483, parentId: CAD_482 },
        { id: CAD_490, parentId: CAD_482 },
      ],
    ],
    [
      'a task twice',
      CAD_483,
      [
        { id: CAD_483, parentId: CAD_482 },
        { id: CAD_483, parentId: CAD_482 },
      ],
    ],
    [
      'a fourth level',
      CAD_482,
      [
        { id: CAD_482, parentId: null },
        { id: CAD_483, parentId: CAD_482 },
        { id: CAD_484, parentId: CAD_483 },
        { id: CAD_490, parentId: CAD_484 },
      ],
    ],
  ])('refuses %s', (_case, rootId, members) => {
    expect(() => depthsUnder(rootId, members)).toThrow(InvalidTaskError);
  });
});

describe('takesRestoredRoot: the parent takes the restored root back, or the root is detached', () => {
  it('keeps a live parent of the same list with room and levels for the archive', () => {
    expect(takesRestoredRoot(restoredParent(), SPRINT_14, 2)).toBe(true);
    expect(takesRestoredRoot(restoredParent({ level: 2, childCount: 24 }), SPRINT_14, 1)).toBe(
      true,
    );
  });

  it('detaches from an archived parent', () => {
    expect(takesRestoredRoot(restoredParent({ live: false }), SPRINT_14, 1)).toBe(false);
  });

  it('detaches from a parent that moved to another list', () => {
    expect(takesRestoredRoot(restoredParent({ listId: BUGS }), SPRINT_14, 1)).toBe(false);
  });

  it('detaches from a parent with 25 live subtasks', () => {
    expect(takesRestoredRoot(restoredParent({ childCount: 25 }), SPRINT_14, 1)).toBe(false);
  });

  it('detaches when the archive would reach below the third level', () => {
    expect(takesRestoredRoot(restoredParent({ level: 2 }), SPRINT_14, 2)).toBe(false);
    expect(takesRestoredRoot(restoredParent({ level: 1 }), SPRINT_14, 3)).toBe(false);
  });

  it('refuses a shape no tree has', () => {
    expect(() => takesRestoredRoot(restoredParent({ level: 0 }), SPRINT_14, 1)).toThrow(
      InvalidTaskError,
    );
    expect(() => takesRestoredRoot(restoredParent({ childCount: -1 }), SPRINT_14, 1)).toThrow(
      InvalidTaskError,
    );
    expect(() => takesRestoredRoot(restoredParent(), SPRINT_14, 0)).toThrow(InvalidTaskError);
  });
});

describe('showsParent: a task reads with its parent only when the parent is in its list and not in the trash', () => {
  it('shows a parent of the same list', () => {
    expect(showsParent(SPRINT_14, SPRINT_14, false)).toBe(true);
  });

  it('reads an archived root whose live parent moved to another list as detached', () => {
    expect(showsParent(SPRINT_14, BUGS, false)).toBe(false);
  });

  it('reads an archived root whose parent is in the trash as detached', () => {
    expect(showsParent(SPRINT_14, SPRINT_14, true)).toBe(false);
  });
});
