import { tool } from 'ai';
import { z } from 'zod';
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  unlink as fsUnlink,
  readdir as fsReaddir,
} from 'node:fs/promises';

export const readFile = tool({
  description: 'Read the contents of a file at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Absolute or relative path to the file.'),
  }),
  execute: async ({ path }) => {
    return await fsReadFile(path, 'utf8');
  },
});

export const writeFile = tool({
  description: 'Create or overwrite a file with the given contents.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to write.'),
    content: z.string().describe('Content to write to the file.'),
  }),
  execute: async ({ path, content }) => {
    await fsWriteFile(path, content, 'utf8');
  },
});

export const deleteFile = tool({
  description: 'Delete the file at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to delete.'),
  }),
  execute: async ({ path }) => {
    await fsUnlink(path);
  },
});

export const listFiles = tool({
  description: 'List files and directories at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Directory path whose entries should be listed.'),
  }),
  execute: async ({ path }) => {
    return await fsReaddir(path);
  },
});
