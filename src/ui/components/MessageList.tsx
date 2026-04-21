import type { ReactNode } from 'react';
import { Box } from 'ink';
import type { ModelMessage } from 'ai';
import { Message } from './Message.js';
import { ToolLine } from './ToolLine.js';
import type { InFlightTool } from '../useAgentChat.helpers.js';
import { previewArgs, summarizeToolOutput } from '../useAgentChat.helpers.js';

interface MessageListProps {
  messages: ModelMessage[];
  streamingText: string;
  inFlightTools: Record<string, InFlightTool>;
}

function textFromContent(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      if (
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        part.type === 'text' &&
        'text' in part &&
        typeof part.text === 'string'
      ) {
        return part.text;
      }
      return '';
    })
    .join('');
}

interface ToolResultOutput {
  type: string;
  value?: unknown;
}

function outputToString(output: ToolResultOutput): string {
  if (!('value' in output)) return '';
  const value = output.value;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isErrorOutput(output: ToolResultOutput): boolean {
  return output.type === 'error-text' || output.type === 'error-json';
}

export function MessageList({
  messages,
  streamingText,
  inFlightTools,
}: MessageListProps) {
  const nodes: ReactNode[] = [];

  messages.forEach((msg, i) => {
    if (msg.role === 'system') return;

    if (msg.role === 'user') {
      nodes.push(
        <Message
          key={`m-${i}`}
          role="user"
          content={textFromContent(msg.content)}
        />,
      );
      return;
    }

    if (msg.role === 'assistant') {
      const content = msg.content;
      if (typeof content === 'string') {
        if (content.trim() !== '') {
          nodes.push(
            <Message key={`m-${i}-s`} role="assistant" content={content} />,
          );
        }
        return;
      }
      if (Array.isArray(content)) {
        content.forEach((part, j) => {
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'text' &&
            'text' in part &&
            typeof part.text === 'string' &&
            part.text.trim() !== ''
          ) {
            nodes.push(
              <Message
                key={`m-${i}-p-${j}`}
                role="assistant"
                content={part.text}
              />,
            );
            return;
          }
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'tool-call' &&
            'toolName' in part &&
            'input' in part &&
            typeof (part as { toolName: unknown }).toolName === 'string'
          ) {
            const p = part as { toolName: string; input: unknown };
            nodes.push(
              <ToolLine
                key={`m-${i}-tc-${j}`}
                mode="call"
                name={p.toolName}
                argsPreview={previewArgs(p.input)}
              />,
            );
          }
        });
      }
      return;
    }

    if (msg.role === 'tool') {
      const content = msg.content;
      if (Array.isArray(content)) {
        content.forEach((part, j) => {
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'tool-result' &&
            'toolName' in part &&
            'output' in part &&
            typeof (part as { toolName: unknown }).toolName === 'string'
          ) {
            const p = part as {
              toolName: string;
              output: ToolResultOutput;
            };
            nodes.push(
              <ToolLine
                key={`m-${i}-tr-${j}`}
                mode="result"
                name={p.toolName}
                status={isErrorOutput(p.output) ? 'error' : 'ok'}
                summary={summarizeToolOutput(
                  p.toolName,
                  outputToString(p.output),
                )}
              />,
            );
          }
        });
      }
      return;
    }
  });

  Object.entries(inFlightTools).forEach(([id, entry]) => {
    nodes.push(
      <ToolLine
        key={`if-${id}`}
        mode="inflight"
        name={entry.name}
        argsPreview={entry.argsPreview}
        status={entry.status}
        summary={entry.summary}
      />,
    );
  });

  if (streamingText !== '') {
    nodes.push(
      <Message key="streaming" role="assistant" content={streamingText} />,
    );
  }

  return <Box flexDirection="column">{nodes}</Box>;
}
