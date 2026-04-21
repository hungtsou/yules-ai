import { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

interface InputBarProps {
  isStreaming: boolean;
  onSubmit: (text: string) => void;
}

export function InputBar({ isStreaming, onSubmit }: InputBarProps) {
  const [value, setValue] = useState('');

  if (isStreaming) {
    return (
      <Box>
        <Text color="green">
          <Spinner type="dots" />
        </Text>
        <Text dimColor> Yules is typing…</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text color="cyan">❯ </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(submitted) => {
          setValue('');
          onSubmit(submitted);
        }}
      />
    </Box>
  );
}
