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
