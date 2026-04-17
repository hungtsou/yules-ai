import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { streamText, type ModelMessage } from 'ai';
import { openai } from '@ai-sdk/openai';
import { SYSTEM_PROMPT } from './system/prompt.js';

export async function runAgent(): Promise<void> {
  const messages: ModelMessage[] = [];
  const rl = createInterface({ input, output, terminal: true });

  let lineChain = Promise.resolve();

  const processLine = async (rawLine: string): Promise<void> => {
    const trimmed = rawLine.trim();
    if (trimmed === '') {
      output.write('You: ');
      return;
    }

    messages.push({ role: 'user', content: trimmed });

    try {
      const result = streamText({
        model: openai('gpt-5-mini'),
        system: SYSTEM_PROMPT,
        messages,
      });

      let full = '';
      for await (const chunk of result.textStream) {
        full += chunk;
        output.write(chunk);
      }

      if (!full.endsWith('\n')) {
        output.write('\n');
      }

      messages.push({ role: 'assistant', content: full });
    } catch (err) {
      console.error(
        'yules-cli:',
        err instanceof Error ? err.message : String(err),
      );
    }

    output.write('You: ');
  };

  return new Promise((resolve) => {
    rl.on('line', (line) => {
      lineChain = lineChain
        .then(() => processLine(line))
        .catch((err: unknown) => {
          console.error(
            'yules-cli:',
            err instanceof Error ? err.message : String(err),
          );
          output.write('You: ');
        });
    });

    rl.on('close', () => {
      void lineChain.finally(() => {
        resolve();
      });
    });

    process.once('SIGINT', () => {
      output.write('\n');
      rl.close();
    });

    output.write('\n');
    output.write('yules-cli — interactive chat (Ctrl+D or Ctrl+C to exit)\n\n');
    output.write('You: ');
  });
}
