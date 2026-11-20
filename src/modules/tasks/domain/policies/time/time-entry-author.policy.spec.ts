import { describe, expect, it } from 'vitest';

import { TimeEntryAuthorRequiredError } from '../../errors/time/time-entry-author-required.error.js';
import { CAMILLE, INES } from '../../tasks.fixture.js';
import { assertTimeEntryAuthor } from './time-entry-author.policy.js';

describe('assertTimeEntryAuthor', () => {
  it('lets Camille remove her own work entry', () => {
    expect(() => {
      assertTimeEntryAuthor(CAMILLE, CAMILLE);
    }).not.toThrow();
  });

  it('refuses someone else who can edit the task', () => {
    expect(() => {
      assertTimeEntryAuthor(CAMILLE, INES);
    }).toThrow(TimeEntryAuthorRequiredError);
  });
});
