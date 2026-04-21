import { Text } from 'ink';

interface ToolLineProps {
  mode: 'call' | 'result' | 'inflight';
  name: string;
  argsPreview?: string;
  status?: 'running' | 'ok' | 'error';
  summary?: string;
}

export function ToolLine({
  mode,
  name,
  argsPreview,
  status,
  summary,
}: ToolLineProps) {
  const args = argsPreview ?? '';

  if (mode === 'call') {
    return (
      <Text color="gray">
        {'▸ '}
        {name}({args})
      </Text>
    );
  }

  if (mode === 'inflight' && status === 'running') {
    return (
      <Text color="yellow">
        {'▸ '}
        {name}({args}) …
      </Text>
    );
  }

  const isError = status === 'error';
  const icon = isError ? '✗' : '✓';
  const color = isError ? 'red' : 'green';
  const tail = summary ? ` — ${summary}` : '';

  return (
    <Text color={color}>
      {icon} {name}
      {tail}
    </Text>
  );
}
