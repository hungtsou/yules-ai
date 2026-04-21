import { streamText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SYSTEM_PROMPT } from './system/prompt.js';

export async function* streamReply(
  messages: ModelMessage[],
): AsyncGenerator<string, void, void> {
  const result = streamText({
    model: openai('gpt-5-mini'),
    system: SYSTEM_PROMPT,
    messages,
  });

  for await (const chunk of result.textStream) {
    yield chunk;
  }
}
