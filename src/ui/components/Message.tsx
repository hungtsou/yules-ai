import { Box, Text } from 'ink';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
}

export function Message({ role, content }: MessageProps) {
  const label = role === 'user' ? 'You' : 'Yules';
  const color = role === 'user' ? 'cyan' : 'green';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color} bold>
        {label}
      </Text>
      <Text wrap="wrap">{content}</Text>
    </Box>
  );
}
