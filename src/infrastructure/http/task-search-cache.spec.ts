import 'reflect-metadata';

import { createApplication, SkipInternalToken } from '@cadenway/nest-common';
import { Controller, Get, Header, Module, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { beforeAll, describe, it } from 'vitest';

import { configureDocumentSpaceAccessCache } from './document-space-access-cache.js';
import { configureTaskSearchCache } from './task-search-cache.js';

@Controller('internal/v1')
class FixtureController {
  // #region Methods
  /** Supplies the same response on either side of the middleware's route boundary. */
  @SkipInternalToken()
  @Get(['task-search-projections', 'task-search-projections-extra'])
  @Header('Last-Modified', 'Thu, 01 Jan 1970 00:00:00 GMT')
  public get(): { readonly available: true } {
    return { available: true };
  }

  /** Leaves token verification to the kit's real guard. */
  @Post(['task-search-projections/resolve', 'task-search-access/resolve', 'spaces/access/resolve'])
  public resolve(): { readonly available: true } {
    return { available: true };
  }
  // #endregion
}

@Module({ controllers: [FixtureController] })
class FixtureModule {}

describe('Task Search response caching', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createApplication(FixtureModule, {
      service: 'task-service',
      version: '0.0.0-test',
      internalToken: {
        verifier: {
          audience: 'task-service',
          trustedIssuers: {
            'search-service': [
              {
                kty: 'OKP',
                crv: 'Ed25519',
                x: 'MVZQc5h6AXxnMpaBTaYw5kI-yWWawl6zp8Srhuf5NK0',
                kid: 'local-placeholder',
              },
            ],
          },
        },
      },
      logDestination: { write: (): void => undefined },
    });
    configureDocumentSpaceAccessCache(app);
    configureTaskSearchCache(app);
    await app.init();
    return () => app.close();
  });

  it('marks the export private even with a query string and trailing slash', async () => {
    await request(app.getHttpServer())
      .get('/internal/v1/task-search-projections/?kind=task')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
  });

  it.each([
    ['If-None-Match', '*'],
    ['If-Modified-Since', 'Fri, 02 Jan 1970 00:00:00 GMT'],
  ])('returns the full private export despite %s', async (header, value) => {
    await request(app.getHttpServer())
      .get('/internal/v1/task-search-projections/?kind=task')
      .set(header, value)
      .expect('Cache-Control', 'private, no-store')
      .expect(200, { available: true });
  });

  it('returns a successful private HEAD response despite a wildcard conditional header', async () => {
    await request(app.getHttpServer())
      .head('/internal/v1/task-search-projections')
      .set('If-None-Match', '*')
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
  });

  it.each(['task-search-projections/resolve', 'task-search-access/resolve'])(
    'marks a guard refusal and a parser error private on %s',
    async (path) => {
      await request(app.getHttpServer())
        .post(`/internal/v1/${path}`)
        .send({})
        .expect('Cache-Control', 'private, no-store')
        .expect(401);
      await request(app.getHttpServer())
        .post(`/internal/v1/${path}`)
        .type('json')
        .send('{')
        .expect('Cache-Control', 'private, no-store')
        .expect(400);
    },
  );

  it('preserves the Document cache policy and leaves neighboring paths unaffected', async () => {
    await request(app.getHttpServer())
      .post('/internal/v1/spaces/access/resolve')
      .send({})
      .expect('Cache-Control', 'no-store')
      .expect(401);
    await request(app.getHttpServer())
      .get('/internal/v1/task-search-projections-extra')
      .expect((response) => {
        if ('cache-control' in response.header) {
          throw new Error('The neighboring route should retain its own cache policy.');
        }
      })
      .expect(200);
    await request(app.getHttpServer())
      .get('/internal/v1/task-search-projections-extra')
      .set('If-None-Match', '*')
      .expect(304);
  });
});
