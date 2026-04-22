import { Box, Text } from 'ink';
import { theme } from '../theme.js';
import { Markdown } from './markdown/Markdown.js';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export function Message({ role, content, streaming = false }: MessageProps) {
  if (role === 'user') {
    return (
      <Box marginBottom={1}>
        <Text color={theme.colors.user}>{theme.chars.userMark} </Text>
        <Text color={theme.colors.mutedStrong} wrap="wrap">
          {content}
        </Text>
      </Box>
    );
  }

  if (streaming) {
    return (
      <Box marginBottom={1}>
        <Text>{theme.emoji.typing} </Text>
        <Text color={theme.colors.mutedStrong} wrap="wrap">
          {content}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={theme.colors.primary}>
          {theme.chars.assistantMark}
          {'  '}
        </Text>
        <Box flexDirection="column" flexGrow={1}>
          <Markdown>{content}</Markdown>
        </Box>
      </Box>
    </Box>
  );
}
