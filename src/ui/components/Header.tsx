import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export function Header() {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.primary}
      paddingX={1}
      marginBottom={1}
    >
      <Text bold color={theme.colors.primary}>
        {theme.emoji.brand} Yules
      </Text>
      <Text color={theme.colors.muted}>general-purpose assistant</Text>
    </Box>
  );
}
