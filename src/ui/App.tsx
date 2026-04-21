import { Box } from 'ink';
import { Header } from './components/Header.js';
import { MessageList } from './components/MessageList.js';
import { ErrorLine } from './components/ErrorLine.js';
import { InputBar } from './components/InputBar.js';
import { useAgentChat } from './useAgentChat.js';

export function App() {
  const { messages, streamingText, status, error, send } = useAgentChat();

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Header />
      <MessageList messages={messages} streamingText={streamingText} />
      {error && <ErrorLine message={error} />}
      <InputBar isStreaming={status === 'streaming'} onSubmit={send} />
    </Box>
  );
}
