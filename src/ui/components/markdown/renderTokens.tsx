import type { ReactNode } from 'react';
import { Box, Text } from 'ink';
import type { Tokens } from 'marked';
import { theme } from '../../theme.js';
import { CodeBlock } from './codeBlock.js';

type BlockToken = Tokens.Generic;
type InlineToken = Tokens.Generic;

function renderInline(tokens: InlineToken[] | undefined): ReactNode[] {
  if (!tokens) return [];
  return tokens.map((tok, i) => {
    switch (tok.type) {
      case 'strong':
        return (
          <Text key={i} bold>
            {renderInline((tok as Tokens.Strong).tokens)}
          </Text>
        );
      case 'em':
        return (
          <Text key={i} italic>
            {renderInline((tok as Tokens.Em).tokens)}
          </Text>
        );
      case 'codespan':
        return (
          <Text
            key={i}
            color={theme.colors.accent}
            backgroundColor={theme.colors.codeBg}
          >
            {(tok as Tokens.Codespan).text}
          </Text>
        );
      case 'link':
        return (
          <Text key={i} color={theme.colors.primary} underline>
            {(tok as Tokens.Link).text}
          </Text>
        );
      case 'br':
        return <Text key={i}>{'\n'}</Text>;
      case 'text':
      default: {
        const t = tok as Tokens.Text;
        if ('tokens' in t && t.tokens) {
          return <Text key={i}>{renderInline(t.tokens)}</Text>;
        }
        return <Text key={i}>{t.text ?? ''}</Text>;
      }
    }
  });
}

function renderBlock(tok: BlockToken, key: number): ReactNode {
  switch (tok.type) {
    case 'heading': {
      const h = tok as Tokens.Heading;
      return (
        <Box key={key} marginBottom={1}>
          <Text bold color={theme.colors.primary}>
            {'#'.repeat(h.depth)} {renderInline(h.tokens)}
          </Text>
        </Box>
      );
    }
    case 'paragraph': {
      const p = tok as Tokens.Paragraph;
      return (
        <Box key={key} marginBottom={1}>
          <Text color={theme.colors.mutedStrong}>{renderInline(p.tokens)}</Text>
        </Box>
      );
    }
    case 'list': {
      const l = tok as Tokens.List;
      return (
        <Box key={key} flexDirection="column" marginBottom={1}>
          {l.items.map((item, j) => (
            <Box key={j}>
              <Text color={theme.colors.primary}>
                {l.ordered ? `${j + 1}. ` : '• '}
              </Text>
              <Text color={theme.colors.mutedStrong}>
                {renderInline(item.tokens as InlineToken[])}
              </Text>
            </Box>
          ))}
        </Box>
      );
    }
    case 'code': {
      const c = tok as Tokens.Code;
      return <CodeBlock key={key} lang={c.lang} value={c.text} />;
    }
    case 'blockquote': {
      const b = tok as Tokens.Blockquote;
      return (
        <Box key={key} marginBottom={1}>
          <Text color={theme.colors.muted}>│ </Text>
          <Box flexDirection="column">
            {b.tokens.map((inner, j) => renderBlock(inner, j))}
          </Box>
        </Box>
      );
    }
    case 'space':
      return null;
    default: {
      const anyTok = tok as { raw?: string; text?: string };
      const raw = anyTok.raw ?? anyTok.text ?? '';
      return (
        <Box key={key} marginBottom={1}>
          <Text color={theme.colors.muted}>{raw}</Text>
        </Box>
      );
    }
  }
}

export function renderTokens(tokens: BlockToken[]): ReactNode[] {
  return tokens.map((tok, i) => renderBlock(tok, i));
}
