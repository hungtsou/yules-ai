import { readFile, writeFile, listFiles, deleteFile } from './file.ts';
import { webSearch } from './webSearch.ts';
// All tools combined for the agent
export const tools = {
  readFile,
  writeFile,
  listFiles,
  deleteFile,
  webSearch,
};

// Export individual tools for selective use in evals
export { readFile, writeFile, listFiles, deleteFile } from './file.ts';
export { webSearch };

// Tool sets for evals
export const fileTools = {
  readFile,
  writeFile,
  listFiles,
  deleteFile,
};
