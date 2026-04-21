import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelMessage } from 'ai';
import { runAgent } from '../agent/run.js';

export type ChatStatus = 'idle' | 'streaming';

export interface UseAgentChat {
  messages: ModelMessage[];
  streamingText: string;
  status: ChatStatus;
  error: string | null;
  send: (text: string) => void;
}

export function useAgentChat(): UseAgentChat {
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === '' || status === 'streaming') return;

      const userMessage: ModelMessage = { role: 'user', content: trimmed };
      const nextMessages = [...messages, userMessage];

      setMessages(nextMessages);
      setStreamingText('');
      setError(null);
      setStatus('streaming');

      void (async () => {
        let accumulated = '';
        try {
          await runAgent(trimmed, nextMessages, {
            onToken: (token) => {
              accumulated += token;
              if (mountedRef.current) setStreamingText(accumulated);
            },
            onToolCallStart: () => {},
            onToolCallEnd: () => {},
            onComplete: () => {},
            onToolApproval: () => Promise.resolve(true),
          });
          if (!mountedRef.current) return;
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: accumulated },
          ]);
          setStreamingText('');
          setStatus('idle');
        } catch (err) {
          if (!mountedRef.current) return;
          setError(err instanceof Error ? err.message : String(err));
          setStreamingText('');
          setStatus('idle');
        }
      })();
    },
    [messages, status],
  );

  return { messages, streamingText, status, error, send };
}
