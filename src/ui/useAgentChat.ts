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
          for await (const chunk of runAgent(nextMessages)) {
            if (!mountedRef.current) return;
            accumulated += chunk;
            setStreamingText(accumulated);
          }
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
