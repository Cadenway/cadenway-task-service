import { decode } from 'html-entities';
import { lexer } from 'marked';
import type { MarkedToken, Token } from 'marked';

import type { CommentPreview } from '../../../../application/ports/outbound/markdown/comment/comment-preview.port.js';

/** Converts Markdown to a bounded plain-text notification preview. */
export class MarkdownCommentPreview implements CommentPreview {
  // #region Methods
  /** Returns at most 200 Unicode code points of readable text. */
  public render(body: string): string {
    const text = renderTokens(lexer(body)).replace(/\s+/gu, ' ').trim();
    return Array.from(text).slice(0, 200).join('');
  }
  // #endregion
}

/** Renders the built-in lexer nodes without HTML or link destinations. */
function renderTokens(tokens: readonly Token[]): string {
  let inRawBlock = false;
  return (tokens as readonly MarkedToken[])
    .map((token) => {
      if (token.type === 'html') {
        if ('inRawBlock' in token) inRawBlock = token.inRawBlock;
        return '';
      }
      if (inRawBlock) return '';
      switch (token.type) {
        case 'heading':
        case 'paragraph':
        case 'blockquote':
        case 'list_item':
          return `${renderTokens(token.tokens)} `;
        case 'list':
          return renderTokens(token.items);
        case 'table':
          return [token.header, ...token.rows]
            .map((row) => row.map((cell) => renderTokens(cell.tokens)).join(' '))
            .join(' ');
        case 'strong':
        case 'em':
        case 'del':
        case 'link':
        case 'image':
          return renderTokens(token.tokens);
        case 'text':
          return token.tokens ? renderTokens(token.tokens) : decode(token.text);
        case 'escape':
        case 'codespan':
        case 'code':
          return token.text;
        case 'br':
        case 'space':
        case 'hr':
          return ' ';
        case 'checkbox':
        case 'def':
          return '';
      }
    })
    .join('');
}
