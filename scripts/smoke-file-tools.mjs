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
  await writeFile.execute({ path: filePath, content: 'hello world' }, opts);
  const onDisk = await fsReadFile(filePath, 'utf8');
  assert(onDisk === 'hello world', `writeFile content mismatch: ${onDisk}`);

  const read = await readFile.execute({ path: filePath }, opts);
  assert(read === 'hello world', `readFile returned ${JSON.stringify(read)}`);

  const entries = await listFiles.execute({ path: root }, opts);
  assert(
    Array.isArray(entries) && entries.includes('hello.txt'),
    `listFiles returned ${JSON.stringify(entries)}`,
  );

  await deleteFile.execute({ path: filePath }, opts);
  const afterDelete = await listFiles.execute({ path: root }, opts);
  assert(
    Array.isArray(afterDelete) && !afterDelete.includes('hello.txt'),
    `deleteFile left file behind: ${JSON.stringify(afterDelete)}`,
  );

  let threw = false;
  try {
    await readFile.execute({ path: missingPath }, opts);
  } catch (err) {
    threw = true;
    assert(
      typeof err === 'object' && err !== null && 'code' in err,
      `expected error object with code, got ${String(err)}`,
    );
  }
  assert(threw, 'readFile on missing path did not throw');

  console.log('OK: all four file tools round-trip against', root);
} finally {
  await rm(root, { recursive: true, force: true });
}
