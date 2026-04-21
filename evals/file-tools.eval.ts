import 'dotenv/config';
import { evaluate } from '@lmnr-ai/lmnr';
import { openai } from '@ai-sdk/openai';
import { loadDatapoints } from './utils.js';
import { createFileToolExecutor } from './executors.js';
import { correctness } from './evaluators.js';

const data = loadDatapoints('evals/data/file.tools.json');

void (async () => {
  await evaluate({
    name: 'file-tools',
    data,
    executor: createFileToolExecutor({ model: openai('gpt-5-mini') }),
    evaluators: { correctness },
  });
})().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
