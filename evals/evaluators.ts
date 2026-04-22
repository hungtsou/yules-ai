import type { Output, Target, MultiTurnResult, MultiTurnTarget } from './types.js';
import { setEqual } from './utils.js';
import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

export function correctness(output: Output, target?: Target): number {
  if (!target) return 0;
  switch (target.category) {
    case 'golden': {
      const expected = target.expectedTools ?? [];
      return setEqual(output.toolsCalled, expected) ? 1 : 0;
    }
    case 'secondary':
      return 1;
    case 'negative': {
      const forbidden = new Set(target.forbiddenTools ?? []);
      const usedAnyForbidden = output.toolsCalled.some((name) =>
        forbidden.has(name),
      );
      return usedAnyForbidden ? 0 : 1;
    }
  }
}

const judgeSchema = z.object({
  score: z
    .number()
    .min(1)
    .max(10)
    .describe("Score from 1-10 where 10 is perfect"),
  reason: z.string().describe("Brief explanation for the score"),
});


/**
 * Evaluator: LLM-as-judge for output quality.
 * Uses structured output to reliably assess if the agent's response is correct.
 * Returns a score from 0-1 (internally uses 1-10 scale divided by 10).
 */
export async function llmJudge(
  output: MultiTurnResult,
  target: MultiTurnTarget,
): Promise<number> {
  const result = await generateObject({
    model: openai("gpt-5.1"),
    schema: judgeSchema,
    schemaName: "evaluation",
    providerOptions: {
      openai: {
        reasoningEffort: "high",
      },
    },
    schemaDescription: "Evaluation of an AI agent response",
    messages: [
      {
        role: "system",
        content: `You are an evaluation judge. Score the agent's response on a scale of 1-10.

Scoring criteria:
- 10: Response fully addresses the task using tool results correctly
- 7-9: Response is mostly correct with minor issues
- 4-6: Response partially addresses the task
- 1-3: Response is mostly incorrect or irrelevant`,
      },
      {
        role: "user",
        content: `Task: ${target.originalTask}

Tools called: ${JSON.stringify(output.toolCallOrder)}
Tool results provided: ${JSON.stringify(target.mockToolResults)}

Agent's final response:
${output.text}

Evaluate if this response correctly uses the tool results to answer the task.`,
      },
    ],
  });

  // Convert 1-10 score to 0-1 range
  return result.object.score / 10;
}
