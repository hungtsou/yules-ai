import { mkdtemp, rm, readFile as fsReadFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readFile,
  writeFile,
  deleteFile,
  listFiles,
} from '../dist/agent/tools/index.js';

const opts = { toolCallId: 'smoke', messages: [] };

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const root = await mkdtemp(join(tmpdir(), 'yules-file-tools-'));
const filePath = join(root, 'hello.txt');
const missingPath = join(root, 'does-not-exist.txt');

try {
  const writeResult = await writeFile.execute(
    { path: filePath, content: 'hello world' },
    opts,
  );
  assert(
    writeResult.includes('Successfully wrote') &&
      writeResult.includes(filePath),
    `writeFile message unexpected: ${writeResult}`,
  );
  const onDisk = await fsReadFile(filePath, 'utf8');
  assert(onDisk === 'hello world', `writeFile content mismatch: ${onDisk}`);

  const read = await readFile.execute({ path: filePath }, opts);
  assert(
    read.includes('Successfully read') && read.includes('hello world'),
    `readFile returned ${JSON.stringify(read)}`,
  );

  const entries = await listFiles.execute({ path: root }, opts);
  assert(
    typeof entries === 'string' &&
      entries.includes('hello.txt') &&
      entries.includes('Successfully listed'),
    `listFiles returned ${JSON.stringify(entries)}`,
  );

  const delMsg = await deleteFile.execute({ path: filePath }, opts);
  assert(
    delMsg.includes('Successfully deleted') && delMsg.includes(filePath),
    `deleteFile message unexpected: ${delMsg}`,
  );
  const afterDelete = await listFiles.execute({ path: root }, opts);
  assert(
    typeof afterDelete === 'string' && !afterDelete.includes('hello.txt'),
    `deleteFile left file behind: ${afterDelete}`,
  );

  const missingRead = await readFile.execute({ path: missingPath }, opts);
  assert(
    missingRead.includes('[readFile]') && missingRead.includes('Error'),
    `expected descriptive error string, got ${JSON.stringify(missingRead)}`,
  );
  assert(
    missingRead.includes('ENOENT') ||
      missingRead.toLowerCase().includes('not exist'),
    `expected ENOENT-ish hint in: ${missingRead}`,
  );

  console.log('OK: all four file tools round-trip against', root);
} finally {
  await rm(root, { recursive: true, force: true });
}
