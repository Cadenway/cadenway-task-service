import type {
  Comment as CommentBody,
  CommentPage,
} from '@cadenway/contracts/types/internal/task-service';
import {
  assertVersionMatch,
  formatEtag,
  InternalAccess,
  parseIfMatch,
  ProblemException,
} from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CommentWriteRefusal } from '../../../../application/models/comment/comment-write-refusal.model.js';
import { ChangeComment } from '../../../../application/use-cases/commands/comment/change-comment/change-comment.use-case.js';
import { UpdateCommentBody } from '../../dto/input/comment/update-comment-body.dto.js';
import { CreateComment } from '../../../../application/use-cases/commands/comment/create-comment/create-comment.use-case.js';
import { CreateCommentBody } from '../../dto/input/comment/create-comment-body.dto.js';
import { CommentReadRefusal } from '../../../../application/models/comment/comment-read-refusal.model.js';
import { GetComment } from '../../../../application/use-cases/queries/comment/get-comment/get-comment.use-case.js';
import { ListComments } from '../../../../application/use-cases/queries/comment/list-comments/list-comments.use-case.js';
import { CommentPath } from '../../dto/input/comment/comment-path.dto.js';
import { CommentsPath } from '../../dto/input/comment/comments-path.dto.js';
import { CommentsQuery } from '../../dto/input/comment/comments-query.dto.js';
import { toCommentReadInput } from '../../mappers/comment/comment-caller.mapper.js';
import {
  decodeCommentCursor,
  encodeCommentCursor,
} from '../../mappers/comment/comment-cursor.mapper.js';
import { toCommentBody } from '../../mappers/comment/comment.mapper.js';

/** Internal comment reads; task visibility is checked before comment identity. */
@Controller('internal/v1/tasks')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class CommentsController {
  // #region Properties
  /** The paginated read. */
  private readonly listComments: ListComments;

  /** The individual read. */
  private readonly getComment: GetComment;

  /** The comment creation. */
  private readonly createComment: CreateComment;

  /** The comment edit and deletion. */
  private readonly changeComment: ChangeComment;
  // #endregion

  // #region Constructor
  /** Takes the read use cases. */
  public constructor(
    listComments: ListComments,
    getComment: GetComment,
    createComment: CreateComment,
    changeComment: ChangeComment,
  ) {
    this.listComments = listComments;
    this.getComment = getComment;
    this.createComment = createComment;
    this.changeComment = changeComment;
  }
  // #endregion

  // #region Methods
  /** Lists live comments in ascending creation order. */
  @Get(':taskKey/comments')
  public async list(
    @Param() path: CommentsPath,
    @Query() query: CommentsQuery,
  ): Promise<CommentPage> {
    try {
      const caller = toCommentReadInput(path.taskKey);
      const page = await this.listComments.execute({
        ...caller,
        after: decodeCommentCursor(query.cursor, path.taskKey, caller.organizationId),
        limit: query.limit,
      });
      return {
        items: page.items.map((comment) => toCommentBody(comment, path.taskKey)),
        nextCursor: encodeCommentCursor(page.next, path.taskKey, caller.organizationId),
        total: page.total,
      };
    } catch (error: unknown) {
      throw commentProblem(error, path.taskKey);
    }
  }

  /** Creates a comment with its Location and version ETag. */
  @Post(':taskKey/comments')
  @HttpCode(201)
  public async create(
    @Param() path: CommentsPath,
    @Body() body: CreateCommentBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CommentBody> {
    try {
      const comment = await this.createComment.execute({
        ...toCommentReadInput(path.taskKey),
        body: body.body,
        mentions: body.mentions,
        replyToCommentId: body.replyToCommentId?.toLowerCase() ?? null,
      });
      response.setHeader(
        'Location',
        `/internal/v1/tasks/${path.taskKey}/comments/${comment.snapshot.id}`,
      );
      response.setHeader('ETag', formatEtag(comment.snapshot.version));
      return toCommentBody(comment, path.taskKey);
    } catch (error: unknown) {
      throw commentProblem(error, path.taskKey);
    }
  }

  /** Edits a comment using its own required version precondition. */
  @Patch(':taskKey/comments/:commentId')
  public async patch(
    @Param() path: CommentPath,
    @Body() body: UpdateCommentBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CommentBody> {
    try {
      const comment = await this.changeComment.execute({
        ...toCommentReadInput(path.taskKey),
        commentId: path.commentId.toLowerCase(),
        expectedVersions: commentVersions(ifMatch, true),
        body: body.body,
        mentions: body.mentions,
      });
      response.setHeader('ETag', formatEtag(comment.snapshot.version));
      return toCommentBody(comment, path.taskKey);
    } catch (error: unknown) {
      throw commentProblem(error, path.taskKey);
    }
  }

  /** Deletes a comment, optionally guarded by its version. */
  @Delete(':taskKey/comments/:commentId')
  @HttpCode(204)
  public async delete(
    @Param() path: CommentPath,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    try {
      await this.changeComment.execute({
        ...toCommentReadInput(path.taskKey),
        commentId: path.commentId.toLowerCase(),
        expectedVersions: commentVersions(ifMatch, false),
        body: null,
      });
    } catch (error: unknown) {
      throw commentProblem(error, path.taskKey);
    }
  }

  /** Reads a live comment with its version as ETag. */
  @Get(':taskKey/comments/:commentId')
  public async get(
    @Param() path: CommentPath,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CommentBody> {
    try {
      const comment = await this.getComment.execute({
        ...toCommentReadInput(path.taskKey),
        commentId: path.commentId.toLowerCase(),
      });
      response.setHeader('ETag', formatEtag(comment.snapshot.version));
      return toCommentBody(comment, path.taskKey);
    } catch (error: unknown) {
      throw commentProblem(error, path.taskKey);
    }
  }
  // #endregion
}

/** Maps comment read refusals to their contract problem codes. */
function commentProblem(error: unknown, taskKey: string): unknown {
  if (error instanceof CommentWriteRefusal) {
    if (error.reason === 'invalid')
      return new ProblemException({ status: 400, code: 'request.invalid' });
    if (error.reason === 'recipient-invalid')
      return new ProblemException({ status: 422, code: 'mention.recipient-invalid' });
    if (error.reason === 'role-insufficient')
      return new ProblemException({
        status: 403,
        code: 'access.role-insufficient',
        details: { role: error.role, requiredRole: 'comment' },
      });
    if (error.reason === 'author-required')
      return new ProblemException({ status: 403, code: 'comment.author-required' });
    if (error.reason === 'version-mismatch')
      return new ProblemException({
        status: 412,
        code: 'request.version-mismatch',
        details: { version: error.version },
      });
    if (error.reason === 'task-archived')
      return new ProblemException({
        status: 409,
        code: 'task.archived',
        details: { key: taskKey },
      });
    return new ProblemException({
      status: 404,
      code:
        error.reason === 'comment-not-found'
          ? 'comment.not-found'
          : error.reason === 'task-not-found'
            ? 'task.not-found'
            : 'organization.not-found',
    });
  }
  if (!(error instanceof CommentReadRefusal)) return error;
  const code =
    error.reason === 'task-not-found'
      ? 'task.not-found'
      : error.reason === 'organization-not-found'
        ? 'organization.not-found'
        : 'comment.not-found';
  return new ProblemException({ status: 404, code });
}

/** Parses the kit's entity-tag condition for the comment version. */
function commentVersions(header: string | undefined, required: boolean): readonly number[] | null {
  const condition = parseIfMatch(header);
  if (condition === undefined) {
    assertVersionMatch(condition, 0, { required });
    return null;
  }
  return condition === '*' ? null : condition;
}
