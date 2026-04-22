import { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';

interface InputBarProps {
  isStreaming: boolean;
  onSubmit: (text: string) => void;
}

export function InputBar({ isStreaming, onSubmit }: InputBarProps) {
  const [value, setValue] = useState('');

  if (isStreaming) {
    return (
      <Box>
        <Text>{theme.emoji.typing} </Text>
        <Text color={theme.colors.primary}>
          <Spinner type={theme.spinner} />
        </Text>
        <Text color={theme.colors.muted}> Yules is typing…</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="round" borderColor={theme.colors.primary} paddingX={1}>
      <Text color={theme.colors.user}>{theme.chars.prompt} </Text>
      <TextInput
        value={value}
        placeholder="ask anything…"
        onChange={setValue}
        onSubmit={(submitted) => {
          setValue('');
          onSubmit(submitted);
        }}
      />
    </Box>
  );
}
