import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelMessage } from 'ai';
import { runAgent } from '../agent/run.js';
import type { InFlightTool } from './useAgentChat.helpers.js';
import { previewArgs, summarizeToolOutput } from './useAgentChat.helpers.js';

export type ChatStatus = 'idle' | 'streaming';

export interface UseAgentChat {
  messages: ModelMessage[];
  streamingText: string;
  status: ChatStatus;
  error: string | null;
  send: (text: string) => void;
  inFlightTools: Record<string, InFlightTool>;
}

export function useAgentChat(): UseAgentChat {
  const [messages, setMessages] = useState<ModelMessage[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [inFlightTools, setInFlightTools] = useState<
    Record<string, InFlightTool>
  >({});

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
      setInFlightTools({});
      setError(null);
      setStatus('streaming');

      void (async () => {
        let accumulated = '';
        try {
          const returned = await runAgent(trimmed, nextMessages, {
            onToken: (token) => {
              accumulated += token;
              if (mountedRef.current) setStreamingText(accumulated);
            },
            onToolCallStart: (id, name, input) => {
              if (!mountedRef.current) return;
              setInFlightTools((prev) => ({
                ...prev,
                [id]: {
                  name,
                  argsPreview: previewArgs(input),
                  status: 'running',
                },
              }));
            },
            onToolCallEnd: (id, name, result, meta) => {
              if (!mountedRef.current) return;
              setInFlightTools((prev) => ({
                ...prev,
                [id]: {
                  ...(prev[id] ?? { name, argsPreview: '' }),
                  status: meta?.error ? 'error' : 'ok',
                  summary: summarizeToolOutput(name, result),
                },
              }));
            },
            onComplete: () => {},
            onToolApproval: () => Promise.resolve(true),
          });
          if (!mountedRef.current) return;
          setMessages(returned);
          setStreamingText('');
          setInFlightTools({});
          setStatus('idle');
        } catch (err) {
          if (!mountedRef.current) return;
          setError(err instanceof Error ? err.message : String(err));
          setStreamingText('');
          setInFlightTools({});
          setStatus('idle');
        }
      })();
    },
    [messages, status],
  );

  return { messages, streamingText, status, error, send, inFlightTools };
}
