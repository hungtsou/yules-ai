import { generateText, stepCountIs, type LanguageModel } from 'ai';
import type { Input, Output } from './types.js';
import { pickTools } from './mocks/tools.js';

export function createFileToolExecutor({
  model,
}: {
  model: LanguageModel;
}): (input: Input) => Promise<Output> {
  return async (input) => {
    const result = await generateText({
      model,
      prompt: input.prompt,
      tools: pickTools(input.tools),
      stopWhen: stepCountIs(1),
    });

    const toolsCalled = Array.from(
      new Set(result.toolCalls.map((call) => call.toolName)),
    );

    return { toolsCalled };
  };
}
