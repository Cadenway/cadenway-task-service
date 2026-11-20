import { describe, expect, it } from 'vitest';

import { MarkdownCommentPreview } from './markdown-comment-preview.adapter.js';

describe('Markdown comment previews', () => {
  const preview = new MarkdownCommentPreview();

  it('returns visible text without formatting, link destinations or HTML', () => {
    const body =
      '# Bonjour **Camille**\n\n[read *this*](https://example.test/private) &amp; ![diagram](https://example.test/image)\n\n- first\n- second\n\n`a < b` <script>hidden</script>';
    expect(preview.render(body)).toBe('Bonjour Camille read this & diagram first second a < b');
  });

  it('limits Unicode after parsing rather than truncating Markdown source', () => {
    expect(preview.render(`[${'🚀'.repeat(201)}](https://example.test/${'x'.repeat(300)})`)).toBe(
      '🚀'.repeat(200),
    );
  });

  it('preserves escaped punctuation and code while reading table cells', () => {
    const body =
      '\\*literal\\* and `&amp;`\n\n| Name | Status |\n| --- | --- |\n| **Camille** | Ready |';
    expect(preview.render(body)).toBe('*literal* and &amp; Name Status Camille Ready');
  });
});
