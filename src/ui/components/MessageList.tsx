import { Box } from 'ink';
import type { ModelMessage } from 'ai';
import { Message } from './Message.js';

interface MessageListProps {
  messages: ModelMessage[];
  streamingText: string;
}

function toText(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) =>
      'text' in part && typeof part.text === 'string' ? part.text : '',
    )
    .join('');
}

export function MessageList({ messages, streamingText }: MessageListProps) {
  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => {
        if (msg.role !== 'user' && msg.role !== 'assistant') return null;
        return (
          <Message key={i} role={msg.role} content={toText(msg.content)} />
        );
      })}
      {streamingText !== '' && (
        <Message role="assistant" content={streamingText} />
      )}
    </Box>
  );
}
