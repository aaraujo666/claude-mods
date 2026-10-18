export type ContextFill = { tokens: number; window: number; percent: number }

export type BackgroundTask = { kind: string; label: string }

declare module 'claude-code' {
  interface PluginState {
    'session-gauges': {
      context: ContextFill | null
      tasks: Record<string, BackgroundTask>
    }
  }
}
