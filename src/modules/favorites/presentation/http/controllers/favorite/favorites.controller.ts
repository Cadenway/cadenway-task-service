import type { Favorite, FavoritePage } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess, parseIfMatch } from '@cadenway/nest-common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { CreateFavorite } from '../../../../application/use-cases/commands/favorite/create-favorite/create-favorite.use-case.js';
import { DeleteFavorite } from '../../../../application/use-cases/commands/favorite/delete-favorite/delete-favorite.use-case.js';
import { GetFavorite } from '../../../../application/use-cases/queries/favorite/get-favorite/get-favorite.use-case.js';
import { ListFavorites } from '../../../../application/use-cases/queries/favorite/list-favorites/list-favorites.use-case.js';
import { CreateFavoriteBody } from '../../dto/input/favorite/create-favorite-body.dto.js';
import { DeleteFavoritePath } from '../../dto/input/favorite/delete-favorite-path.dto.js';
import { GetFavoritePath } from '../../dto/input/favorite/get-favorite-path.dto.js';
import { ListFavoritesQuery } from '../../dto/input/favorite/list-favorites-query.dto.js';
import { answerFavoriteRefusals } from '../../errors/favorite/favorite-refusal.problem.js';
import {
  toFavoriteCursor,
  toFavoritePosition,
} from '../../mappers/favorite/favorite-cursor.mapper.js';
import { toFavoriteOwner } from '../../mappers/favorite/favorite-owner.mapper.js';
import { toFavorite } from '../../mappers/favorite/favorite.mapper.js';

/** Internal current-user routes for private favorites. */
@Controller('internal/v1/me/favorites')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class FavoritesController {
  // #region Constructor
  /** Takes the four operations supplied by FavoritesModule. */
  public constructor(
    private readonly createFavorite: CreateFavorite,
    private readonly deleteFavorite: DeleteFavorite,
    private readonly getFavorite: GetFavorite,
    private readonly listFavorites: ListFavorites,
  ) {}
  // #endregion

  // #region Methods
  /** Lists active visible entries, binding the cursor to the current user and organization. */
  @Get()
  public async list(@Query() query: ListFavoritesQuery): Promise<FavoritePage> {
    const owner = toFavoriteOwner();
    const page = await answerFavoriteRefusals(() =>
      this.listFavorites.execute({
        ...owner,
        limit: query.limit,
        after: toFavoritePosition(owner, query.cursor),
      }),
    );
    return { items: page.items.map(toFavorite), nextCursor: toFavoriteCursor(owner, page.next) };
  }

  /** Creates a favorite and returns the resource, Location and versioned ETag. */
  @Post()
  @HttpCode(201)
  public async create(
    @Body() body: CreateFavoriteBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Favorite> {
    const owner = toFavoriteOwner();
    const result = await answerFavoriteRefusals(() =>
      this.createFavorite.execute({
        ...owner,
        targetId: body.targetId.toLowerCase(),
        kind: body.kind,
      }),
    );
    response.setHeader('Location', `/internal/v1/me/favorites/${result.id}`);
    return toFavorite(result);
  }

  /** Reads the caller's visible favorite and returns its ETag. */
  @Get(':favoriteId')
  public async get(@Param() path: GetFavoritePath): Promise<Favorite> {
    const owner = toFavoriteOwner();
    return toFavorite(
      await answerFavoriteRefusals(() =>
        this.getFavorite.execute({
          ...owner,
          favoriteId: path.favoriteId.toLowerCase(),
        }),
      ),
    );
  }

  /** Deletes the caller's visible favorite, with the optional version precondition. */
  @Delete(':favoriteId')
  @HttpCode(204)
  public async remove(
    @Param() path: DeleteFavoritePath,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<void> {
    const owner = toFavoriteOwner();
    const condition = parseIfMatch(ifMatch);
    await answerFavoriteRefusals(() =>
      this.deleteFavorite.execute({
        ...owner,
        favoriteId: path.favoriteId.toLowerCase(),
        expectedVersions: condition === undefined || condition === '*' ? null : condition,
      }),
    );
  }
  // #endregion
}
