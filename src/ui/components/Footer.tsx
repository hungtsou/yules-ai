import { Box, Text } from 'ink';
import { theme } from '../theme.js';

interface FooterProps {
  modelName: string;
}

export function Footer({ modelName }: FooterProps) {
  return (
    <Box paddingX={2}>
      <Text color={theme.colors.muted}>{modelName}</Text>
    </Box>
  );
}
