import { organizationPolicy } from '@cadenway/nest-common/database';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import type { OnboardingColor } from '../../../../../domain/value-objects/onboarding/onboarding-color.value-object.js';
import type { OnboardingPresetKey } from '../../../../../domain/value-objects/onboarding/onboarding-preset-key.value-object.js';
import type { OnboardingState } from '../../../../../domain/value-objects/onboarding/onboarding-state.value-object.js';

/** One private wizard and checklist for an organization member. The migration forces RLS. */
export const onboardingStates = pgTable(
  'onboarding_states',
  {
    organizationId: uuid('organization_id').notNull(),
    userId: uuid('user_id').notNull(),
    version: integer('version').notNull().default(1),
    status: text('status')
      .$type<OnboardingState['wizard']['status']>()
      .notNull()
      .default('in-progress'),
    step: text('step').$type<OnboardingState['wizard']['step']>().notNull().default('space'),
    preset: text('preset').$type<OnboardingPresetKey>().notNull().default('dev'),
    name: text('name'),
    prefix: text('prefix'),
    color: text('color').$type<OnboardingColor>().notNull().default('violet'),
    spaceId: uuid('space_id'),
    firstListId: uuid('first_list_id'),
    presentation: text('presentation')
      .$type<OnboardingState['checklist']['presentation']>()
      .notNull()
      .default('expanded'),
    firstTaskCreated: boolean('first_task_created').notNull().default(false),
    invitationSent: boolean('invitation_sent').notNull().default(false),
    boardTried: boolean('board_tried').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'onboarding_states_pkey', columns: [table.organizationId, table.userId] }),
    check('onboarding_states_version_check', sql`${table.version} >= 1`),
    check(
      'onboarding_states_status_check',
      sql`${table.status} in ('in-progress', 'finished', 'dismissed')`,
    ),
    check(
      'onboarding_states_step_check',
      sql`${table.step} in ('space', 'preset', 'team', 'import')`,
    ),
    check(
      'onboarding_states_preset_check',
      sql`${table.preset} in ('dev', 'mkt', 'agency', 'blank')`,
    ),
    check(
      'onboarding_states_color_check',
      sql`${table.color} in ('gris', 'violet', 'indigo', 'azur', 'lagon', 'vert', 'olive', 'jaune', 'orange', 'rouge', 'rose', 'fuchsia', 'ardoise')`,
    ),
    check(
      'onboarding_states_presentation_check',
      sql`${table.presentation} in ('expanded', 'collapsed', 'dismissed')`,
    ),
    check(
      'onboarding_states_provisioning_check',
      sql`(${table.spaceId} is null and ${table.firstListId} is null and ${table.status} <> 'finished' and ${table.firstTaskCreated} = false and ${table.boardTried} = false and ${table.presentation} = 'expanded') or (${table.spaceId} is not null and ${table.firstListId} is not null and ${table.status} = 'finished' and ${table.step} = 'import' and ${table.name} is not null and ${table.prefix} is not null)`,
    ),
    organizationPolicy('onboarding_states_organization_isolation'),
  ],
);
