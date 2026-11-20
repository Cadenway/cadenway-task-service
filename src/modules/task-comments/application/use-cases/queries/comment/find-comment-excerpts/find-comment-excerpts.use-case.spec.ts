import { describe, expect, it, vi } from 'vitest';

import { FindCommentExcerpts } from './find-comment-excerpts.use-case.js';

describe('finding notification comment excerpts', () => {
  it('passes the tenant and exact task-comment pairs to one read and projects each preview', async () => {
    const pairs = [
      { taskId: 'task-1', commentId: 'comment-1' },
      { taskId: 'task-2', commentId: 'comment-2' },
    ];
    const findLive = vi.fn().mockResolvedValue([
      { ...pairs[0], body: '**Camille**' },
      { ...pairs[1], body: 'Bonjour' },
    ]);
    const render = vi.fn((body: string): string => `preview ${body}`);
    const result = await new FindCommentExcerpts({ findLive }, { render }).execute({
      organizationId: 'organization',
      pairs,
    });

    expect(findLive).toHaveBeenCalledOnce();
    expect(findLive).toHaveBeenCalledWith('organization', pairs);
    expect(render).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { ...pairs[0], excerpt: 'preview **Camille**' },
      { ...pairs[1], excerpt: 'preview Bonjour' },
    ]);
  });

  it('does not query on an empty batch and rejects a batch over 100', async () => {
    const findLive = vi.fn();
    const useCase = new FindCommentExcerpts({ findLive }, { render: vi.fn() });
    expect(await useCase.execute({ organizationId: 'organization', pairs: [] })).toEqual([]);
    await expect(
      useCase.execute({
        organizationId: 'organization',
        pairs: Array.from({ length: 101 }, () => ({ taskId: 'task', commentId: 'comment' })),
      }),
    ).rejects.toThrow(RangeError);
    expect(findLive).not.toHaveBeenCalled();
  });
});
