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
import type { SubtaskParent } from '../../value-objects/subtask/subtask-parent.value-object.js';
import type { SubtreeShape } from '../../value-objects/subtask/subtree-shape.value-object.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import { checkAttachment, checkNewSubtask } from './subtask-tree.policy.js';

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
