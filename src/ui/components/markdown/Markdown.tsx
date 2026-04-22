import { Box, Text } from 'ink';
import { marked } from 'marked';
import { theme } from '../../theme.js';
import { renderTokens } from './renderTokens.js';

interface MarkdownProps {
  children: string;
}

export function Markdown({ children }: MarkdownProps) {
  let tokens;
  try {
    tokens = marked.lexer(children);
  } catch {
    return (
      <Text color={theme.colors.mutedStrong} wrap="wrap">
        {children}
      </Text>
    );
  }
  return <Box flexDirection="column">{renderTokens(tokens)}</Box>;
}
