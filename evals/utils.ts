import { readFileSync } from 'node:fs';
import type { Datapoint } from './types.js';

export function loadDatapoints(path: string): Datapoint[] {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected an array of datapoints in ${path}`);
  }
  return parsed as Datapoint[];
}

export function setEqual(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) {
    if (!sb.has(x)) return false;
  }
  return true;
}
