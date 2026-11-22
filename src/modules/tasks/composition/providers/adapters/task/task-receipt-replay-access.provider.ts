import {
  CreateTaskDependencyInternalResponse,
  CreateTaskInternalResponse,
  DuplicateListInternalResponse,
  ExecuteBulkTaskActionInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { ProblemException } from '@cadenway/nest-common';
import { IDEMPOTENCY_KEY_HEADER } from '@cadenway/nest-common/database';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

import { authorizeIdempotentReplay } from '../../../../../../infrastructure/http/authorize-idempotent-replay.js';
import { AssertCanReplayTaskReceipt } from '../../../../application/use-cases/queries/task/assert-can-replay-task-receipt/assert-can-replay-task-receipt.use-case.js';
import type { AssertCanReplayTaskReceiptInput } from '../../../../application/use-cases/queries/task/assert-can-replay-task-receipt/assert-can-replay-task-receipt.input.js';
import { TaskKey } from '../../../../domain/value-objects/task/task-key.value-object.js';
import { BulkTaskActionsController } from '../../../../presentation/http/controllers/bulk/bulk-task-actions.controller.js';
import { ChecklistItemsController } from '../../../../presentation/http/controllers/checklist/checklist-items.controller.js';
import { TaskDependenciesController } from '../../../../presentation/http/controllers/dependency/task-dependencies.controller.js';
import { ListDuplicateController } from '../../../../presentation/http/controllers/duplicate/list-duplicate.controller.js';
import { TaskDuplicateController } from '../../../../presentation/http/controllers/duplicate/task-duplicate.controller.js';
import { SubtasksController } from '../../../../presentation/http/controllers/subtask/subtasks.controller.js';
import { ListTasksController } from '../../../../presentation/http/controllers/task/list-tasks.controller.js';
import { BulkTaskActionBody } from '../../../../presentation/http/dto/input/bulk/bulk-task-action-body.dto.js';
import { DuplicateListPath } from '../../../../presentation/http/dto/input/duplicate/duplicate-list-path.dto.js';
import { CreateTaskPath } from '../../../../presentation/http/dto/input/task/create-task-path.dto.js';
import { TaskPath } from '../../../../presentation/http/dto/input/task/task-path.dto.js';
import { answerRefusals } from '../../../../presentation/http/errors/task/task-refusal.problem.js';
import { toCaller } from '../../../../presentation/http/mappers/caller/caller.mapper.js';

type ReceiptResources = Omit<
  AssertCanReplayTaskReceiptInput,
  'organizationId' | 'actorUserId' | 'notFound'
>;
type ReceiptResolver = (request: Request, body: unknown) => ReceiptResources | null;

interface ReceiptRoute {
  // #region Properties
  /** Concealed failure appropriate to the route's resource. */
  readonly notFound: AssertCanReplayTaskReceiptInput['notFound'];

  /** Extracts the receipt's authorization scope. */
  readonly resolve: ReceiptResolver;
  // #endregion
}

// All full Task receipts share the same Read model and fields used for resource authorization.
const taskScope = CreateTaskInternalResponse.pick({
  key: true,
  listId: true,
  parentKey: true,
  nextOccurrenceKey: true,
});

function linkedKeys(...keys: readonly (string | null | undefined)[]): string[] {
  return keys.filter((key): key is string => key != null);
}

const createdTask: ReceiptResolver = (request, body) => {
  const path = CreateTaskPath.schema.safeParse(request.params);
  const task = taskScope.safeParse(body);
  if (!path.success || !task.success || task.data.listId !== path.data.listId.toLowerCase()) {
    return null;
  }
  const { key, listId, parentKey, nextOccurrenceKey } = task.data;
  return { taskKeys: linkedKeys(key, parentKey, nextOccurrenceKey), listIds: [listId] };
};

function taskAtPath(relation?: 'parentKey' | 'key'): ReceiptResolver {
  return (request, body) => {
    const path = TaskPath.schema.safeParse(request.params);
    const task = taskScope.safeParse(body);
    if (!path.success || !task.success) return null;
    const { taskKey } = path.data;
    if (relation !== undefined && task.data[relation] !== taskKey) return null;
    const { key, listId, parentKey, nextOccurrenceKey } = task.data;
    return { taskKeys: linkedKeys(taskKey, key, parentKey, nextOccurrenceKey), listIds: [listId] };
  };
}

const duplicatedList: ReceiptResolver = (request, body) => {
  const path = DuplicateListPath.schema.safeParse(request.params);
  const list = DuplicateListInternalResponse.safeParse(body);
  if (!path.success || !list.success) return null;
  return { taskKeys: [], listIds: [path.data.listId, list.data.list.id] };
};

const createdDependency: ReceiptResolver = (request, body) => {
  const path = TaskPath.schema.safeParse(request.params);
  const dependency = CreateTaskDependencyInternalResponse.safeParse(body);
  if (!path.success || !dependency.success) return null;
  const { blocked, blocker } = dependency.data;
  if (blocked.key !== path.data.taskKey && blocker.key !== path.data.taskKey) return null;
  return {
    taskKeys: linkedKeys(blocked.key, blocker.key, blocked.parentKey, blocker.parentKey),
    listIds: [blocked.listId, blocker.listId],
  };
};

const bulkResult: ReceiptResolver = (request, body) => {
  const key = request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
  const input = BulkTaskActionBody.schema.safeParse(request.body);
  const result = ExecuteBulkTaskActionInternalResponse.safeParse(body);
  if (typeof key !== 'string' || !input.success || !result.success) return null;
  const { selection, action } = input.data;
  const { results } = result.data;
  if (results.length !== selection.length) return null;
  const taskKeys: string[] = [];
  const trash: { taskKey: string; entryId: string }[] = [];
  for (const [index, row] of results.entries()) {
    const { taskKey, newTaskKey, successorKey, trashEntryId } = row;
    if (taskKey !== selection[index]?.taskKey) return null;
    if (newTaskKey !== undefined && successorKey !== undefined) return null;
    if (trashEntryId !== undefined) {
      if (action.type !== 'trash') return null;
      trash.push({ taskKey, entryId: trashEntryId });
    } else {
      taskKeys.push(taskKey);
    }
    taskKeys.push(...linkedKeys(newTaskKey, successorKey));
  }
  return { taskKeys, listIds: [], trash, bulk: { key, serializedResponse: JSON.stringify(body) } };
};

/** Uses the method reference Nest exposes as the route handler. */
function handlerOf<T extends object>(prototype: T, name: keyof T): unknown {
  return Reflect.get(prototype, name);
}

const routes = new Map<unknown, ReceiptRoute>([
  [
    handlerOf(ListTasksController.prototype, 'create'),
    { resolve: createdTask, notFound: 'list-not-found' },
  ],
  [
    handlerOf(SubtasksController.prototype, 'create'),
    { resolve: taskAtPath('parentKey'), notFound: 'task-not-found' },
  ],
  [
    handlerOf(ChecklistItemsController.prototype, 'add'),
    { resolve: taskAtPath('key'), notFound: 'task-not-found' },
  ],
  [
    handlerOf(TaskDependenciesController.prototype, 'create'),
    { resolve: createdDependency, notFound: 'task-not-found' },
  ],
  [
    handlerOf(ListDuplicateController.prototype, 'duplicate'),
    { resolve: duplicatedList, notFound: 'list-not-found' },
  ],
  [
    handlerOf(TaskDuplicateController.prototype, 'duplicate'),
    { resolve: taskAtPath(), notFound: 'task-not-found' },
  ],
  [
    handlerOf(BulkTaskActionsController.prototype, 'execute'),
    { resolve: bulkResult, notFound: 'task-not-found' },
  ],
]);

/** Revalidates both the historical scope and current visibility of stored mutation responses. */
@Injectable()
export class TaskReceiptReplayAccessInterceptor implements NestInterceptor {
  // #region Constructor
  /** Uses the task module's current authorization check. */
  public constructor(private readonly replayAccess: AssertCanReplayTaskReceipt) {}
  // #endregion

  // #region Methods
  /** Wraps the kit interceptor so that its cached response can be checked before sending. */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const route = routes.get(context.getHandler());
    if (context.getType() !== 'http' || route === undefined) return next.handle();
    const code = route.notFound === 'list-not-found' ? 'list.not-found' : 'task.not-found';
    return authorizeIdempotentReplay(context, next, code, async (request, body) => {
      const scope = route.resolve(request, body);
      if (scope?.taskKeys.every((key) => TaskKey.isKey(key)) !== true) {
        throw new ProblemException({ status: 404, code });
      }
      await answerRefusals(() =>
        this.replayAccess.execute({ ...toCaller(), ...scope, notFound: route.notFound }),
      );
    });
  }
  // #endregion
}
