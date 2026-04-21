import { tool, type Tool } from 'ai';
import { z } from 'zod';

export const ALL_FILE_TOOLS: Record<string, Tool> = {
  readFile: tool({
    description: 'Read the contents of a file at the given path.',
    inputSchema: z.object({
      path: z.string().describe('Absolute or relative path to the file.'),
    }),
    execute: async () => '',
  }),
  writeFile: tool({
    description: 'Create or overwrite a file with the given contents.',
    inputSchema: z.object({
      path: z.string().describe('Path to the file to write.'),
      content: z.string().describe('Content to write to the file.'),
    }),
    execute: async () => '',
  }),
  listFiles: tool({
    description: 'List files and directories at the given path.',
    inputSchema: z.object({
      path: z
        .string()
        .describe('Directory path whose entries should be listed.'),
    }),
    execute: async () => '',
  }),
  deleteFile: tool({
    description: 'Delete the file at the given path.',
    inputSchema: z.object({
      path: z.string().describe('Path to the file to delete.'),
    }),
    execute: async () => '',
  }),
};

export function pickTools(names: string[]): Record<string, Tool> {
  const picked: Record<string, Tool> = {};
  for (const name of names) {
    const t = ALL_FILE_TOOLS[name];
    if (t) picked[name] = t;
  }
  return picked;
}
