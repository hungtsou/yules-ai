import { Box } from 'ink';
import { Header } from './components/Header.js';
import { MessageList } from './components/MessageList.js';
import { ErrorLine } from './components/ErrorLine.js';
import { InputBar } from './components/InputBar.js';
import { Footer } from './components/Footer.js';
import { Thinking } from './components/Thinking.js';
import { useAgentChat } from './useAgentChat.js';

export function App() {
  const {
    messages,
    streamingText,
    status,
    error,
    send,
    inFlightTools,
    modelName,
  } = useAgentChat();

  const anyToolRunning = Object.values(inFlightTools).some(
    (t) => t.status === 'running',
  );
  const showThinking =
    status === 'streaming' && streamingText === '' && !anyToolRunning;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Header />
      <MessageList
        messages={messages}
        streamingText={streamingText}
        inFlightTools={inFlightTools}
      />
      {showThinking && <Thinking />}
      {error && <ErrorLine message={error} />}
      <InputBar isStreaming={status === 'streaming'} onSubmit={send} />
      <Footer modelName={modelName} />
    </Box>
  );
}
