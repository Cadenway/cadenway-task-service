import { describe, expect, it } from 'vitest';
import { ATELIER_NORD, CAD_482, CAMILLE, InMemoryTasks } from '../../../tasks.fixture.js';
import { RecordCommentActivity } from './record-comment-activity.use-case.js';

describe('record comment activity', () => {
  it('attributes a delegated comment to its rule and preserves human attribution', async () => {
    const tasks = InMemoryTasks.withCad482();
    const record = new RecordCommentActivity(tasks);
    const input = {
      organizationId: ATELIER_NORD,
      actorUserId: CAMILLE,
      taskKey: 'CAD-482',
      taskVersion: 12,
      commentId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30',
      excerpt: 'Ready for review',
    };
    const actor = { type: 'automation', id: '019a5f3c-9e1f-7b2a-8c3d-4e5f6a7b8c31' } as const;

    await record.execute({ ...input, actor });
    await record.execute({ ...input, commentId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31' });

    expect(tasks.entriesOf(CAD_482)).toMatchObject([
      { actor, change: { kind: 'comment', commentId: input.commentId } },
      { actor: { type: 'user', id: CAMILLE }, change: { kind: 'comment' } },
    ]);
  });
});
