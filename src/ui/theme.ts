export const theme = {
  colors: {
    primary: '#5eead4',
    user: '#22d3ee',
    accent: '#fbbf24',
    muted: '#94a3b8',
    mutedStrong: '#cbd5e1',
    success: '#4ade80',
    error: '#f87171',
    codeBg: '#0f172a',
  },
  emoji: {
    brand: '🌊',
    thinking: ['💭', '🧠', '✨', '💡'] as const,
    typing: '✍️',
    tools: {
      readFile: '📖',
      writeFile: '✏️',
      listFiles: '📂',
      deleteFile: '🗑',
      default: '🔧',
    } as Record<string, string>,
  },
  chars: {
    userMark: '>',
    assistantMark: '●',
    toolHeadMark: '⏺',
    toolChildMark: '└─',
    ok: '✓',
    err: '✗',
    prompt: '❯',
  },
  spinner: 'dots' as const,
  timing: {
    thinkingCycleMs: 400,
  },
} as const;

export function emojiForTool(name: string): string {
  return theme.emoji.tools[name] ?? theme.emoji.tools.default;
}
