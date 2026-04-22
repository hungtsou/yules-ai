import { Box, Text } from 'ink';
import { highlight } from 'cli-highlight';
import { theme } from '../../theme.js';

interface CodeBlockProps {
  lang?: string;
  value: string;
}

function safeHighlight(value: string, lang?: string): string {
  if (!lang) return value;
  try {
    return highlight(value, { language: lang, ignoreIllegals: true });
  } catch {
    return value;
  }
}

export function CodeBlock({ lang, value }: CodeBlockProps) {
  const highlighted = safeHighlight(value, lang);
  return (
    <Box flexDirection="column" marginY={1}>
      {lang ? <Text color={theme.colors.muted}> {lang}</Text> : null}
      <Box borderStyle="round" borderColor={theme.colors.muted} paddingX={1}>
        <Text>{highlighted}</Text>
      </Box>
    </Box>
  );
}
