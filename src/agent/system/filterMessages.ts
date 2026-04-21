import type { ModelMessage } from 'ai';

/**
 * Filter conversation history to only include compatible message formats.
 * Provider tools (like webSearch) may return messages with formats that
 * cause issues when passed back to subsequent API calls.
 *
 * Assistant messages are retained if they carry at least one text,
 * tool-call, or reasoning part — a pure tool-call turn is valid on
 * its own and must be preserved so the model can reference its own
 * prior tool use on later turns.
 */
export const filterCompatibleMessages = (
  messages: ModelMessage[],
): ModelMessage[] => {
  return messages.filter((msg) => {
    if (msg.role === 'user' || msg.role === 'system') {
      return true;
    }

    if (msg.role === 'tool') {
      return true;
    }

    if (msg.role === 'assistant') {
      const content = msg.content;
      if (typeof content === 'string') {
        return content.trim() !== '';
      }
      if (Array.isArray(content)) {
        return content.some((part: unknown) => {
          if (typeof part === 'string') {
            return part.trim() !== '';
          }
          if (typeof part === 'object' && part !== null) {
            const p = part as { type?: string; text?: string };
            if (p.type === 'tool-call') return true;
            if (p.type === 'reasoning') return true;
            if (typeof p.text === 'string' && p.text.trim() !== '') {
              return true;
            }
          }
          return false;
        });
      }
      return false;
    }

    return false;
  });
};
