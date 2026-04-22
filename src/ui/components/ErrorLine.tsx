import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface ErrorLineProps {
  message: string;
}

export function ErrorLine({ message }: ErrorLineProps) {
  return (
    <Box marginBottom={1}>
      <Text color={theme.colors.error} bold>
        Error: {message}
      </Text>
    </Box>
  );
}
