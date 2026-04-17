#!/usr/bin/env node
import { config } from 'dotenv';
import { runAgent } from './agent/run.js';

config({ quiet: true });

const key = process.env.OPENAI_API_KEY?.trim();
if (!key) {
  console.error(
    'yules-cli: OPENAI_API_KEY is missing or empty. Create a .env file in your current working directory with OPENAI_API_KEY set (this CLI loads .env from cwd).',
  );
  process.exit(1);
}

runAgent().catch((err: unknown) => {
  console.error('yules-cli:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
