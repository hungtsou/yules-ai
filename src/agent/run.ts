import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SYSTEM_PROMPT } from './system/prompt.js';
import { tools } from './tools/index.js';
import type { AgentCallbacks } from '../types.ts';
import { filterCompatibleMessages } from './system/filterMessages.js';
import { getTracer, Laminar } from '@lmnr-ai/lmnr';

Laminar.initialize({
  projectApiKey: process.env.LMNR_PROJECT_API_KEY,
});

export const MODEL_NAME = 'gpt-5-mini';

function stringifyToolResult(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {
  const messages = filterCompatibleMessages(conversationHistory);

  const result = streamText({
    model: openai(MODEL_NAME),
    system: SYSTEM_PROMPT,
    messages,
    tools,
    stopWhen: stepCountIs(10),
    experimental_telemetry: {
      isEnabled: true,
      tracer: getTracer(),
    },
  });

  for await (const chunk of result.fullStream) {
    switch (chunk.type) {
      case 'text-delta':
        callbacks.onToken(chunk.text);
        break;
      case 'tool-call':
        callbacks.onToolCallStart(
          chunk.toolCallId,
          chunk.toolName,
          chunk.input,
        );
        break;
      case 'tool-result':
        callbacks.onToolCallEnd(
          chunk.toolCallId,
          chunk.toolName,
          stringifyToolResult(chunk.output),
        );
        break;
      case 'tool-error':
        callbacks.onToolCallEnd(
          chunk.toolCallId,
          chunk.toolName,
          errorToString(chunk.error),
          { error: true },
        );
        break;
      case 'tool-output-denied':
        callbacks.onToolCallEnd(
          chunk.toolCallId,
          chunk.toolName,
          'Tool execution was denied.',
          { error: true },
        );
        break;
      case 'error':
        throw chunk.error instanceof Error
          ? chunk.error
          : new Error(errorToString(chunk.error));
      case 'abort':
        throw new Error(chunk.reason ?? 'Stream aborted.');
      default:
        // text-start/end, reasoning-*, tool-input-*, start/finish-step, finish,
        // sources, etc. — framing/metadata; no token or tool callback here.
        break;
    }
  }

  const response = await result.response;
  return [...messages, ...response.messages];
}
