import { tool } from 'ai';
import { z } from 'zod';
import {
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  unlink as fsUnlink,
  readdir as fsReaddir,
} from 'node:fs/promises';

function describeFsError(toolName: string, path: string, err: unknown): string {
  const errno = err as NodeJS.ErrnoException;
  const code = errno.code ?? 'UNKNOWN';
  const syscall = errno.syscall;
  const detail =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String(err);

  let hint = '';
  switch (code) {
    case 'ENOENT':
      hint =
        ' Nothing exists at this path, or an intermediate directory is missing. For writes, create parent directories first or choose an existing path.';
      break;
    case 'EACCES':
    case 'EPERM':
      hint =
        ' The process was not allowed to perform this operation. Check permissions or try another path.';
      break;
    case 'EISDIR':
      hint =
        ' This path refers to a directory; this tool expected a regular file.';
      break;
    case 'ENOTDIR':
      hint =
        ' A component of the path is a file where a directory was expected.';
      break;
    case 'EEXIST':
      hint = ' Something already exists at this path.';
      break;
    case 'ENOTEMPTY':
      hint = ' The directory is not empty.';
      break;
    case 'EBUSY':
      hint = ' The file or directory is busy (often locked or in use).';
      break;
  }

  const syscallPart = syscall ? ` Syscall: ${syscall}.` : '';
  return `[${toolName}] Error on "${path}". Code: ${code}.${syscallPart} ${detail}.${hint}`.trim();
}

export const readFile = tool({
  description: 'Read the contents of a file at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Absolute or relative path to the file.'),
  }),
  execute: async ({ path }) => {
    try {
      const content = await fsReadFile(path, 'utf8');
      return [
        `Successfully read file: ${path}`,
        `Length: ${content.length} characters (${Buffer.byteLength(content, 'utf8')} bytes UTF-8).`,
        '',
        '--- file contents ---',
        content,
        '--- end ---',
      ].join('\n');
    } catch (err) {
      return describeFsError('readFile', path, err);
    }
  },
});

export const writeFile = tool({
  description: 'Create or overwrite a file with the given contents.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to write.'),
    content: z.string().describe('Content to write to the file.'),
  }),
  execute: async ({ path, content }) => {
    try {
      await fsWriteFile(path, content, 'utf8');
      const bytes = Buffer.byteLength(content, 'utf8');
      return [
        `Successfully wrote file: ${path}`,
        `Characters: ${content.length}, UTF-8 bytes: ${bytes}.`,
        'The file was created or overwritten.',
      ].join(' ');
    } catch (err) {
      return describeFsError('writeFile', path, err);
    }
  },
});

export const deleteFile = tool({
  description: 'Delete the file at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Path to the file to delete.'),
  }),
  execute: async ({ path }) => {
    try {
      await fsUnlink(path);
      return `Successfully deleted file: ${path}. The path no longer exists as a file.`;
    } catch (err) {
      return describeFsError('deleteFile', path, err);
    }
  },
});

export const listFiles = tool({
  description: 'List files and directories at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Directory path whose entries should be listed.'),
  }),
  execute: async ({ path }) => {
    try {
      const names = await fsReaddir(path);
      if (names.length === 0) {
        return `Successfully listed directory: ${path}\n(Empty — no files or subdirectories.)`;
      }
      const lines = names.map((name, i) => `${i + 1}. ${name}`);
      return [
        `Successfully listed directory: ${path}`,
        `Entries (${names.length}):`,
        ...lines,
      ].join('\n');
    } catch (err) {
      return describeFsError('listFiles', path, err);
    }
  },
});
