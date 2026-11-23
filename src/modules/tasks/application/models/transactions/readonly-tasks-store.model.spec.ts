import { describe, expectTypeOf, it } from 'vitest';

import type { ReadonlyTasksStore } from './readonly-tasks-store.model.js';
import type { TasksStore } from './tasks-store.model.js';

describe('ReadonlyTasksStore', () => {
  it('accepts a transaction store while excluding mutation operations', () => {
    expectTypeOf<TasksStore>().toExtend<ReadonlyTasksStore>();
    expectTypeOf<'events'>().not.toExtend<keyof ReadonlyTasksStore>();
    expectTypeOf<'jobs'>().not.toExtend<keyof ReadonlyTasksStore>();
    expectTypeOf<'savepoint'>().not.toExtend<keyof ReadonlyTasksStore>();
    expectTypeOf<'save'>().not.toExtend<keyof ReadonlyTasksStore['tasks']>();
    expectTypeOf<Parameters<ReadonlyTasksStore['tasks']['findByKey']>[2]>().toEqualTypeOf<false>();
    expectTypeOf<'insert'>().not.toExtend<keyof ReadonlyTasksStore['activity']>();
    expectTypeOf<'create'>().not.toExtend<keyof ReadonlyTasksStore['time']>();
    expectTypeOf<'set'>().not.toExtend<keyof ReadonlyTasksStore['watcherOverrides']>();
    expectTypeOf<'record'>().not.toExtend<keyof ReadonlyTasksStore['bulkReceipts']>();
  });
});
