import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme, emojiForTool } from '../theme.js';

interface ToolGroupProps {
  name: string;
  argsPreview?: string;
  status: 'running' | 'ok' | 'error';
  summary?: string;
}

export function ToolGroup({
  name,
  argsPreview,
  status,
  summary,
}: ToolGroupProps) {
  const emoji = emojiForTool(name);
  const args = argsPreview ?? '';

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Box>
        <Text color={theme.colors.muted}>{theme.chars.toolHeadMark} </Text>
        <Text>{emoji} </Text>
        <Text color={theme.colors.muted}>{name}</Text>
        {args ? (
          <>
            <Text color={theme.colors.muted}> </Text>
            <Text color={theme.colors.accent}>{args}</Text>
          </>
        ) : null}
      </Box>
      <Box>
        <Text color={theme.colors.muted}> {theme.chars.toolChildMark} </Text>
        {status === 'running' ? (
          <>
            <Text color={theme.colors.accent}>
              <Spinner type={theme.spinner} />
            </Text>
            <Text color={theme.colors.muted}> running…</Text>
          </>
        ) : status === 'ok' ? (
          <>
            <Text color={theme.colors.success}>{theme.chars.ok} </Text>
            <Text color={theme.colors.mutedStrong}>{summary ?? 'done'}</Text>
          </>
        ) : (
          <>
            <Text color={theme.colors.error}>{theme.chars.err} </Text>
            <Text color={theme.colors.error}>{summary ?? 'error'}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
