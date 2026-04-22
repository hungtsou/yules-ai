import type { ReactNode } from 'react';
import { isValidElement } from 'react';
import { Box } from 'ink';
import type { ModelMessage } from 'ai';
import { Message } from './Message.js';
import { ToolGroup } from './ToolGroup.js';
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

interface PendingToolCall {
  id: string;
  name: string;
  argsPreview: string;
  pushKey: string;
}

export function MessageList({
  messages,
  streamingText,
  inFlightTools,
}: MessageListProps) {
  const nodes: ReactNode[] = [];
  const pendingByCallId = new Map<string, PendingToolCall>();

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
            'toolCallId' in part &&
            'toolName' in part &&
            'input' in part &&
            typeof (part as { toolCallId: unknown }).toolCallId === 'string' &&
            typeof (part as { toolName: unknown }).toolName === 'string'
          ) {
            const p = part as {
              toolCallId: string;
              toolName: string;
              input: unknown;
            };
            const pushKey = `m-${i}-tc-${j}`;
            pendingByCallId.set(p.toolCallId, {
              id: p.toolCallId,
              name: p.toolName,
              argsPreview: previewArgs(p.input),
              pushKey,
            });
            nodes.push(
              <ToolGroup
                key={pushKey}
                name={p.toolName}
                argsPreview={previewArgs(p.input)}
                status="running"
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
            'toolCallId' in part &&
            'toolName' in part &&
            'output' in part &&
            typeof (part as { toolCallId: unknown }).toolCallId === 'string' &&
            typeof (part as { toolName: unknown }).toolName === 'string'
          ) {
            const p = part as {
              toolCallId: string;
              toolName: string;
              output: ToolResultOutput;
            };
            const pending = pendingByCallId.get(p.toolCallId);
            const replacementKey = pending?.pushKey ?? `m-${i}-tr-${j}`;
            const replacementIndex = pending
              ? nodes.findIndex(
                  (n) => isValidElement(n) && n.key === pending.pushKey,
                )
              : -1;
            const replacement = (
              <ToolGroup
                key={replacementKey}
                name={p.toolName}
                argsPreview={pending?.argsPreview}
                status={isErrorOutput(p.output) ? 'error' : 'ok'}
                summary={summarizeToolOutput(
                  p.toolName,
                  outputToString(p.output),
                )}
              />
            );
            if (replacementIndex >= 0) {
              nodes[replacementIndex] = replacement;
            } else {
              nodes.push(replacement);
            }
            pendingByCallId.delete(p.toolCallId);
          }
        });
      }
      return;
    }
  });

  Object.entries(inFlightTools).forEach(([id, entry]) => {
    nodes.push(
      <ToolGroup
        key={`if-${id}`}
        name={entry.name}
        argsPreview={entry.argsPreview}
        status={entry.status}
        summary={entry.summary}
      />,
    );
  });

  if (streamingText !== '') {
    nodes.push(
      <Message
        key="streaming"
        role="assistant"
        content={streamingText}
        streaming
      />,
    );
  }

  return <Box flexDirection="column">{nodes}</Box>;
}
