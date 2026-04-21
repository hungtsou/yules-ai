import { Box, Text } from 'ink';

export function Header() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold> 🤖 Yules AI — interactive chat</Text>
      <Text dimColor>Ctrl+C to exit</Text>
    </Box>
  );
}
