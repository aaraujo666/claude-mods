import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BackgroundTask, ContextFill } from '../types'

const context = atom({ plugin: 'session-gauges', key: 'context' } as const, null)
const tasks = atom({ plugin: 'session-gauges', key: 'tasks' } as const, {})

const BAR_CELLS = 20
const FINISHED = new Set(['completed', 'failed', 'killed', 'stopped', 'cancelled'])
const NOTIFICATION = /<task-notification>([\s\S]*?)<\/task-notification>/g

type Usage = { tokens?: number; window: number; percent?: number }

// The engine reports the fill once a response of the live window carried one.
const setContext = async ($: EngineInterface, usage: Usage) => {
  if (usage.tokens === undefined || usage.percent === undefined) return
  const fill: ContextFill = { tokens: usage.tokens, window: usage.window, percent: usage.percent }
  await update($, context, () => fill)
}

const addTask = ($: EngineInterface, id: string | undefined, task: BackgroundTask) =>
  id ? update($, tasks, all => ({ ...all, [id]: task })) : undefined

const dropTasks = ($: EngineInterface, ids: string[]) =>
  ids.length === 0
    ? undefined
    : update($, tasks, all => {
        const kept = { ...all }
        for (const id of ids) delete kept[id]
        return kept
      })

// A task notification names the task and how it ended; ids of finished ones.
export const finishedIds = (text: string): string[] => {
  const ids: string[] = []
  for (const [, body = ''] of text.matchAll(NOTIFICATION)) {
    const id = /<task-id>\s*([^<\s]+)\s*<\/task-id>/.exec(body)?.[1]
    const status = /<status>\s*([^<\s]+)\s*<\/status>/.exec(body)?.[1] ?? 'completed'
    if (id && FINISHED.has(status.toLowerCase())) ids.push(id)
  }
  return ids
}

const clip = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

export const bar = (percent: number) => {
  const filled = Math.min(BAR_CELLS, Math.round((Math.max(0, percent) / 100) * BAR_CELLS))
  return { filled: '█'.repeat(filled), empty: '░'.repeat(BAR_CELLS - filled) }
}

const fillColor = (percent: number) => (percent >= 80 ? 'error' : percent >= 60 ? 'warning' : 'success')

// Every gauge is display only: if its bookkeeping throws, the event goes on as
// if the mod were not there (each gating hook's .catch passes it through).
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await setContext($, (await $.session.usage()).context)
    return started
  })

  on('session.measure', async ($, e, next) => {
    await setContext($, e.context)
    return next(e)
  })

  // Launches: each tool that can leave work running reports the task's id.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran

    if (e.tool === 'Bash' || e.tool === 'PowerShell') {
      const result = ran.result as { backgroundTaskId?: string } | undefined
      await addTask($, result?.backgroundTaskId, { kind: 'shell', label: clip(e.description ?? e.command) })
    } else if (e.tool === 'Agent') {
      const result = ran.result as { status?: string; agentId?: string; taskId?: string } | undefined
      if (result?.status === 'async_launched') {
        await addTask($, result.agentId, { kind: 'agent', label: clip(e.description) })
      } else if (result?.status === 'remote_launched') {
        await addTask($, result.taskId, { kind: 'remote', label: clip(e.description) })
      }
    } else if (e.tool === 'Monitor' || e.tool === 'Workflow') {
      const result = ran.result as { taskId?: string } | undefined
      await addTask($, result?.taskId, { kind: e.tool.toLowerCase(), label: e.tool })
    } else if (e.tool === 'TaskStop') {
      await dropTasks($, [e.task_id ?? e.shell_id].filter((id): id is string => !!id))
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Completions: the task notification lands in the conversation as a row.
  on('session.append', async ($, e, next) => {
    const text = e.message.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('\n')
    if (text.includes('<task-notification>')) await dropTasks($, finishedIds(text))
    return next(e)
  }).catch(($, e, next) => next(e))

  // At each stop the engine lists what is still in flight: take it as truth,
  // which also picks up a command the person backgrounded with ctrl+b.
  on('classic.Stop', async ($, e, next) => {
    const live = e.background_tasks
    if (live) {
      await update($, tasks, all => {
        const inFlight: Record<string, BackgroundTask> = {}
        for (const t of live) {
          inFlight[t.id] = all[t.id] ?? { kind: t.type, label: clip(t.description || t.command || t.type) }
        }
        return inFlight
      })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const fill = await read($, context)
    const running = Object.values(await read($, tasks))
    if (fill === null && running.length === 0) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const cells = fill ? bar(fill.percent) : null

    // The desktop app's own view tool opens its background-task pane.
    const openTasks = async () => {
      const shown = await $.tool.call({ tool: 'mcp__ccd_view__show_pane', pane: 'tasks' } as never)
      if (shown.deny !== undefined || shown.isError) $.ui.toast('Could not open the tasks pane')
    }

    return (
      <Box flexDirection="row" gap={1}>
        {fill && cells ? (
          <Text key="context">
            <Text color={fillColor(fill.percent)}>{cells.filled}</Text>
            <Text dimColor>{cells.empty}</Text>
            <Text> {fill.percent}% </Text>
            <Text dimColor>
              {formatTokens(fill.tokens)} / {formatTokens(fill.window)}
            </Text>
          </Text>
        ) : null}
        {running.length > 0 ? (
          <Button key="tasks" plain onPress={openTasks}>
            <Text color="warning">
              {fill ? '· ' : ''}⏳ {running.length} background {running.length === 1 ? 'task' : 'tasks'}:{' '}
              {running.map(t => `${t.kind} (${t.label})`).join(', ')}
            </Text>
          </Button>
        ) : null}
      </Box>
    )
  })
}
