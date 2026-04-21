import type { Output, Target } from './types.js';
import { setEqual } from './utils.js';

export function correctness(output: Output, target?: Target): number {
  if (!target) return 0;
  switch (target.category) {
    case 'golden': {
      const expected = target.expectedTools ?? [];
      return setEqual(output.toolsCalled, expected) ? 1 : 0;
    }
    case 'secondary':
      return 1;
    case 'negative': {
      const forbidden = new Set(target.forbiddenTools ?? []);
      const usedAnyForbidden = output.toolsCalled.some((name) =>
        forbidden.has(name),
      );
      return usedAnyForbidden ? 0 : 1;
    }
  }
}
