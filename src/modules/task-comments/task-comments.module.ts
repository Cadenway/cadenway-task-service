import { OutboxRelay, OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { BeginComment } from '../tasks/public/task/begin-comment.js';
import { RecordCommentActivity } from '../tasks/public/task/record-comment-activity.js';
import { ChangeComment } from './application/use-cases/commands/comment/change-comment/change-comment.use-case.js';
import { AllocateApprovalCommentId } from './public/comment/allocate-approval-comment-id.js';
import { CreateApprovalComment } from './public/comment/create-approval-comment.js';
import { FindCommentExcerpts } from './public/comment/find-comment-excerpts.js';
import { CreateComment } from './application/use-cases/commands/comment/create-comment/create-comment.use-case.js';
import { TasksCommentWriter } from './infrastructure/adapters/tasks/tasks-comment-writer.adapter.js';
import { MarkdownCommentPreview } from './infrastructure/adapters/markdown/comment/markdown-comment-preview.adapter.js';
import { Idempotent, TenantTransactionRunner } from '@cadenway/nest-common/database';
import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module.js';
import { ResolveCommentTask } from '../tasks/public/task/resolve-comment-task.js';
import { GetComment } from './application/use-cases/queries/comment/get-comment/get-comment.use-case.js';
import { ListComments } from './application/use-cases/queries/comment/list-comments/list-comments.use-case.js';
import { TasksCommentDirectory } from './infrastructure/adapters/tasks/tasks-comment-directory.adapter.js';
import { DrizzleCommentExcerptReader } from './infrastructure/persistence/drizzle/repositories/comment/drizzle-comment-excerpt.repository.js';
import { TenantCommentUnitOfWork } from './infrastructure/persistence/drizzle/transactions/comment/tenant-comment.unit-of-work.js';
import { CommentsController } from './presentation/http/controllers/comment/comments.controller.js';

/** Applies the kit's idempotency metadata to the creation handler. */
function markCreateIdempotent(): void {
  const descriptor = Object.getOwnPropertyDescriptor(CommentsController.prototype, 'create');
  if (descriptor === undefined) throw new Error('The comment creation handler is missing.');
  Idempotent()(CommentsController.prototype, 'create', descriptor);
}
markCreateIdempotent();

/** Composition root of the comment reads and creation. */
@Module({
  imports: [TasksModule],
  controllers: [CommentsController],
  exports: [AllocateApprovalCommentId, CreateApprovalComment, FindCommentExcerpts],
  providers: [
    {
      provide: AllocateApprovalCommentId,
      inject: [TenantTransactionRunner],
      useFactory: (runner: TenantTransactionRunner): AllocateApprovalCommentId =>
        new AllocateApprovalCommentId({
          allocate: () =>
            runner.run(async (tx) => {
              const result = await tx.client.query('select uuidv7()::text as id');
              const row = result.rows[0];
              if (
                typeof row !== 'object' ||
                row === null ||
                !('id' in row) ||
                typeof row.id !== 'string'
              ) {
                throw new Error('Could not allocate an approval comment ID.');
              }
              return row.id;
            }),
        }),
    },
    {
      provide: CreateApprovalComment,
      inject: [TenantCommentUnitOfWork, TasksCommentWriter],
      useFactory: (
        unit: TenantCommentUnitOfWork,
        tasks: TasksCommentWriter,
      ): CreateApprovalComment => new CreateApprovalComment(unit, tasks),
    },
    {
      provide: ChangeComment,
      inject: [TenantCommentUnitOfWork, TasksCommentWriter],
      useFactory: (unit: TenantCommentUnitOfWork, tasks: TasksCommentWriter): ChangeComment =>
        new ChangeComment(unit, tasks),
    },
    {
      provide: TasksCommentWriter,
      inject: [BeginComment, RecordCommentActivity, ResolveCommentTask],
      useFactory: (
        begin: BeginComment,
        activity: RecordCommentActivity,
        resolver: ResolveCommentTask,
      ): TasksCommentWriter => new TasksCommentWriter(begin, activity, resolver),
    },
    {
      provide: CreateComment,
      inject: [TenantCommentUnitOfWork, TasksCommentWriter],
      useFactory: (unit: TenantCommentUnitOfWork, tasks: TasksCommentWriter): CreateComment =>
        new CreateComment(unit, tasks),
    },
    {
      provide: TenantCommentUnitOfWork,
      inject: [TenantTransactionRunner, OutboxWriter, OutboxRelay],
      useFactory: (
        runner: TenantTransactionRunner,
        outbox: OutboxWriter,
        relay: OutboxRelay,
      ): TenantCommentUnitOfWork => new TenantCommentUnitOfWork(runner, outbox, relay),
    },
    {
      provide: TasksCommentDirectory,
      inject: [ResolveCommentTask],
      useFactory: (resolver: ResolveCommentTask): TasksCommentDirectory =>
        new TasksCommentDirectory(resolver),
    },
    {
      provide: ListComments,
      inject: [TenantCommentUnitOfWork, TasksCommentDirectory],
      useFactory: (unit: TenantCommentUnitOfWork, tasks: TasksCommentDirectory): ListComments =>
        new ListComments(unit, tasks),
    },
    {
      provide: GetComment,
      inject: [TenantCommentUnitOfWork, TasksCommentDirectory],
      useFactory: (unit: TenantCommentUnitOfWork, tasks: TasksCommentDirectory): GetComment =>
        new GetComment(unit, tasks),
    },
    {
      provide: FindCommentExcerpts,
      inject: [TenantTransactionRunner],
      useFactory: (runner: TenantTransactionRunner): FindCommentExcerpts =>
        new FindCommentExcerpts(
          {
            findLive: (organizationId, pairs) =>
              runner.run(
                (tx) => new DrizzleCommentExcerptReader(tx.db).findLive(organizationId, pairs),
                { readOnly: true, isolationLevel: 'repeatable read' },
              ),
          },
          new MarkdownCommentPreview(),
        ),
    },
  ],
})
export class TaskCommentsModule {}
