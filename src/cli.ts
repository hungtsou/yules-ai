#!/usr/bin/env node
import { createElement } from 'react';
import { config } from 'dotenv';
import { render } from 'ink';
import { App } from './ui/App.js';

config({ quiet: true });

const key = process.env.OPENAI_API_KEY?.trim();
if (!key) {
  console.error(
    'yules-ai: OPENAI_API_KEY is missing or empty. Create a .env file in your current working directory with OPENAI_API_KEY set (this CLI loads .env from cwd).',
  );
  process.exit(1);
}

const { waitUntilExit } = render(createElement(App));
waitUntilExit().catch((err: unknown) => {
  console.error('yules-ai:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
