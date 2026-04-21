import { streamText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SYSTEM_PROMPT } from './system/prompt.js';
import type { AgentCallbacks } from "../types.ts";
import { filterCompatibleMessages } from "./system/filterMessages.js";

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {

  const messages = filterCompatibleMessages(conversationHistory);

  const result = streamText({
    model: openai('gpt-5-mini'),
    system: SYSTEM_PROMPT,
    messages,
  });

  for await (const chunk of result.fullStream) {
    if(chunk.type === "text-delta") {
      callbacks.onToken(chunk.text);
    }
  }

  return messages;
}
