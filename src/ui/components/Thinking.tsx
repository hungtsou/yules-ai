import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';

export function Thinking() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % theme.emoji.thinking.length);
    }, theme.timing.thinkingCycleMs);
    return () => clearInterval(id);
  }, []);
  return (
    <Box marginBottom={1} paddingLeft={2}>
      <Text>{theme.emoji.thinking[frame]} </Text>
      <Text color={theme.colors.muted}>thinking </Text>
      <Text color={theme.colors.primary}>
        <Spinner type={theme.spinner} />
      </Text>
    </Box>
  );
}
