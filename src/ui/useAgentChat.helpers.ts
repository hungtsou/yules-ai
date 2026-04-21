export interface InFlightTool {
  name: string;
  argsPreview: string;
  status: 'running' | 'ok' | 'error';
  summary?: string;
}

const MAX_LINE = 80;

function truncate(s: string, max: number = MAX_LINE): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function previewArgs(input: unknown): string {
  let text: string;
  if (typeof input === 'string') {
    text = input;
  } else {
    try {
      text = JSON.stringify(input);
    } catch {
      text = String(input);
    }
  }
  text = (text ?? '').replace(/\s+/g, ' ').trim();
  return truncate(text);
}

export function summarizeToolOutput(_name: string, raw: string): string {
  const lines = raw.split('\n');
  const successLine = lines.find((line) => line.startsWith('Successfully '));
  const firstNonEmpty = lines.find((line) => line.trim().length > 0) ?? '';
  return truncate((successLine ?? firstNonEmpty).trim());
}
