export type Category = 'golden' | 'secondary' | 'negative';

export interface Input {
  prompt: string;
  tools: string[];
}

export interface Output {
  toolsCalled: string[];
}

export interface Target {
  category: Category;
  expectedTools?: string[];
  forbiddenTools?: string[];
}

export interface Datapoint {
  data: Input;
  target: Target;
  metadata?: Record<string, unknown>;
}

/**
 * Target expectations for multi-turn evaluations
 */
export interface MultiTurnTarget {
  /** Original task description for LLM judge context */
  originalTask: string;
  /** Expected tools in order (for tool ordering evaluation) */
  expectedToolOrder?: string[];
  /** Tools that must NOT be called */
  forbiddenTools?: string[];
  /** Mock tool results for LLM judge context */
  mockToolResults: Record<string, string>;
  /** Category for grouping */
  category: "task-completion" | "conversation-continuation" | "negative";
}

/**
 * Result from multi-turn executor
 */
export interface MultiTurnResult {
  /** Final text response from the agent */
  text: string;
  /** All steps taken during the agent loop */
  steps: Array<{
    toolCalls?: Array<{ toolName: string; args: unknown }>;
    toolResults?: Array<{ toolName: string; result: unknown }>;
    text?: string;
  }>;
  /** Unique tool names used during the run */
  toolsUsed: string[];
  /** All tool calls in order */
  toolCallOrder: string[];
}
