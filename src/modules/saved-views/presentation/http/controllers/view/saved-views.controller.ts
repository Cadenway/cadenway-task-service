import type { SavedView, SavedViewPage } from '@cadenway/contracts/types/internal/task-service';
import { formatEtag, InternalAccess } from '@cadenway/nest-common';
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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CreateSavedView } from '../../../../application/use-cases/commands/view/create-saved-view/create-saved-view.use-case.js';
import { DeleteSavedView } from '../../../../application/use-cases/commands/view/delete-saved-view/delete-saved-view.use-case.js';
import { DuplicateSavedView } from '../../../../application/use-cases/commands/view/duplicate-saved-view/duplicate-saved-view.use-case.js';
import { UpdateSavedView } from '../../../../application/use-cases/commands/view/update-saved-view/update-saved-view.use-case.js';
import { GetSavedView } from '../../../../application/use-cases/queries/view/get-saved-view/get-saved-view.use-case.js';
import { ListSavedViews } from '../../../../application/use-cases/queries/view/list-saved-views/list-saved-views.use-case.js';
import { SavedViewCollectionPath } from '../../dto/input/view/saved-view-collection-path.dto.js';
import { SavedViewItemPath } from '../../dto/input/view/saved-view-item-path.dto.js';
import { ListSavedViewsQuery } from '../../dto/input/view/list-saved-views-query.dto.js';
import { CreateSavedViewBody } from '../../dto/input/view/create-saved-view-body.dto.js';
import { UpdateSavedViewBody } from '../../dto/input/view/update-saved-view-body.dto.js';
import { DuplicateSavedViewBody } from '../../dto/input/view/duplicate-saved-view-body.dto.js';
import { answerSavedViewRefusals } from '../../errors/view/saved-view.problem.js';
import { RequiredSavedViewBodyGuard } from '../../guards/view/required-saved-view-body.guard.js';
import {
  readViewCursor,
  toCollection,
  toItem,
  toSavedView,
  toWrite,
  writeViewCursor,
} from '../../mappers/view/saved-view.mapper.js';

/** Writes the representation metadata of the new view or a successful item read or update. */
function setItemHeaders(response: Response, view: SavedView, created = false): void {
  response.setHeader('ETag', formatEtag(view.version));
  if (created) {
    response.setHeader('Location', `/internal/v1/lists/${view.listId}/saved-views/${view.id}`);
  }
}

/** Routes for shared views of a list, for a verified human actor in the API gateway. */
@Controller('internal/v1/lists/:listId/saved-views')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class SavedViewsController {
  // #region Constructor
  /** Wires each contract operation to its single application use case. */
  public constructor(
    private readonly listViews: ListSavedViews,
    private readonly createView: CreateSavedView,
    private readonly getView: GetSavedView,
    private readonly updateView: UpdateSavedView,
    private readonly deleteView: DeleteSavedView,
    private readonly duplicateView: DuplicateSavedView,
  ) {}
  // #endregion

  // #region Methods
  /** Reads one page of available shared views, including views of an archived list. */
  @Get()
  public async list(
    @Param() path: SavedViewCollectionPath,
    @Query() query: ListSavedViewsQuery,
  ): Promise<SavedViewPage> {
    const collection = toCollection(path.listId);
    const after = readViewCursor(collection, query.cursor);
    const page = await answerSavedViewRefusals(() =>
      this.listViews.execute({ ...collection, limit: query.limit, after }),
    );
    return {
      items: page.items.map(toSavedView),
      nextCursor: writeViewCursor(collection, page.next),
    };
  }

  /** Creates a shared view at the end of the list and reports its Location and ETag. */
  @Post()
  public async create(
    @Param() path: SavedViewCollectionPath,
    @Body() body: CreateSavedViewBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SavedView> {
    const view = toSavedView(
      await answerSavedViewRefusals(() => this.createView.execute(toCollection(path.listId), body)),
    );
    setItemHeaders(response, view, true);
    return view;
  }

  /** Reads one view from its list. */
  @Get(':viewId')
  public async get(
    @Param() path: SavedViewItemPath,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SavedView> {
    const view = toSavedView(
      await answerSavedViewRefusals(() => this.getView.execute(toItem(path.listId, path.viewId))),
    );
    setItemHeaders(response, view);
    return view;
  }

  /** Merges the supplied settings into the current view and returns its current version. */
  @Patch(':viewId')
  @UseGuards(RequiredSavedViewBodyGuard)
  public async update(
    @Param() path: SavedViewItemPath,
    @Body() body: UpdateSavedViewBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SavedView> {
    const view = toSavedView(
      await answerSavedViewRefusals(() =>
        this.updateView.execute(toWrite(path.listId, path.viewId, ifMatch), body),
      ),
    );
    setItemHeaders(response, view);
    return view;
  }

  /** Hard-deletes the current view and returns no representation. */
  @Delete(':viewId')
  @HttpCode(204)
  public remove(
    @Param() path: SavedViewItemPath,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    return answerSavedViewRefusals(() =>
      this.deleteView.execute(toWrite(path.listId, path.viewId, ifMatch)),
    );
  }

  /** Inserts a copy directly after the source and returns the new view's metadata. */
  @Post(':viewId/duplicate')
  @UseGuards(RequiredSavedViewBodyGuard)
  public async duplicate(
    @Param() path: SavedViewItemPath,
    @Body() _body: DuplicateSavedViewBody,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SavedView> {
    const view = toSavedView(
      await answerSavedViewRefusals(() =>
        this.duplicateView.execute(toWrite(path.listId, path.viewId, ifMatch)),
      ),
    );
    setItemHeaders(response, view, true);
    return view;
  }
  // #endregion
}
