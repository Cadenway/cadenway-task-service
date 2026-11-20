import { CONFIG } from '@cadenway/nest-common';
import { TenantTransactionRunner } from '@cadenway/nest-common/database';
import type { Provider } from '@nestjs/common';

import type { AppConfig } from '../../../../../../config/app-config.js';
import { ListTaskSearchProjections } from '../../../../application/use-cases/queries/search-projection/list-task-search-projections/list-task-search-projections.use-case.js';
import { ResolveTaskSearchProjections } from '../../../../application/use-cases/queries/search-projection/resolve-task-search-projections/resolve-task-search-projections.use-case.js';
import { AesSearchProjectionCursor } from '../../../../infrastructure/adapters/search-projection/aes-search-projection-cursor.adapter.js';
import { DrizzleSearchProjectionReader } from '../../../../infrastructure/persistence/drizzle/repositories/search-projection/drizzle-search-projection-reader.repository.js';

/** Shares one owned projection reader with the export and the access proof. */
export const taskSearchProjectionProviders: readonly Provider[] = [
  {
    provide: DrizzleSearchProjectionReader,
    inject: [TenantTransactionRunner],
    useFactory: (tenant: TenantTransactionRunner) => new DrizzleSearchProjectionReader(tenant),
  },
  {
    provide: ListTaskSearchProjections,
    inject: [DrizzleSearchProjectionReader, CONFIG],
    useFactory: (
      reader: DrizzleSearchProjectionReader,
      config: AppConfig,
    ): ListTaskSearchProjections => {
      const key = config.SEARCH_PROJECTION_CURSOR_SECRET;
      const cursor =
        key === undefined ? null : new AesSearchProjectionCursor(Buffer.from(key, 'base64url'));
      return new ListTaskSearchProjections(reader, cursor);
    },
  },
  {
    provide: ResolveTaskSearchProjections,
    inject: [DrizzleSearchProjectionReader],
    useFactory: (reader: DrizzleSearchProjectionReader) => new ResolveTaskSearchProjections(reader),
  },
];
