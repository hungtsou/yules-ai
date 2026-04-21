import { Box, Text } from 'ink';

interface ErrorLineProps {
  message: string;
}

export function ErrorLine({ message }: ErrorLineProps) {
  return (
    <Box marginBottom={1}>
      <Text color="red">Error: {message}</Text>
    </Box>
  );
}
