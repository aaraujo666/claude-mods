import { expect, test } from 'claude-code/testing'

import { bar, finishedIds, formatTokens } from '../hooks/register'

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10 },
} as const

const notification = (id: string, status: string) =>
  `<task-notification>\n<task-id>${id}</task-id>\n<status>${status}</status>\n<summary>done</summary>\n</task-notification>`

test('pure helpers', async () => {
  expect(formatTokens(84_300)).toBe('84k')
  expect(formatTokens(1_000_000)).toBe('1.0M')
  expect(bar(50).filled.length).toBe(10)
  expect(bar(150).empty).toBe('')
  expect(finishedIds(notification('b1', 'completed') + notification('b2', 'running'))).toEqual(['b1'])
})

test('band shows context fill and tracks a background shell to completion', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }) as never)
  on('session.measure', () => ({ changed: ['context'] }))

  await $.session.measure({ context: { tokens: 84_000, window: 200_000, percent: 42 }, rateLimits: [] } as never)
  await $.tool.call({ tool: 'Bash', command: 'sleep 60', run_in_background: true, description: 'long sleep' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-gauges', surface, ...BAND } as never)
    expect((await ui.find({ type: 'Box' }))?.text).toContain('42%')
    expect((await ui.find({ type: 'Box' }))?.text).toContain('84k / 200k')
    expect((await ui.find({ type: 'Box' }))?.text).toContain('1 background task')
    await ui.unmount()
  }

  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: notification('b1', 'completed') }] } } as never)

  const ui = await $.ui.mount({ plugin: 'session-gauges', surface: 'desktop', ...BAND } as never)
  expect((await ui.find({ type: 'Box' }))?.text).not.toContain('background')
  expect((await ui.find({ type: 'Box' }))?.text).toContain('42%')
  await ui.unmount()
})

test('pressing the task count opens the desktop tasks pane', async ($, on) => {
  const panes: string[] = []
  on('tool.call', ($, e) => {
    const call = e as unknown as { tool: string; pane?: string }
    if (call.tool === 'mcp__ccd_view__show_pane') {
      panes.push(call.pane ?? '')
      return { result: 'shown' } as never
    }
    return { result: { backgroundTaskId: 'b7' } } as never
  })
  await $.tool.call({ tool: 'Bash', command: 'sleep 9', run_in_background: true } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'session-gauges', surface, ...BAND } as never)
    await ui.press({ key: 'tasks' })
    await ui.unmount()
  }
  expect(panes).toEqual(['tasks', 'tasks'])
})

test('a stop reconciles to what the engine says is in flight', async ($, on) => {
  on('tool.call', () => ({ result: { status: 'async_launched', agentId: 'a1', description: 'scan', prompt: 'x' } }) as never)
  on('classic.Stop', () => ({}) as never)
  await $.tool.call({ tool: 'Agent', description: 'scan', prompt: 'x', run_in_background: true } as never)

  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'm9', type: 'monitor', status: 'running', description: 'tail log' }],
  } as never)

  const ui = await $.ui.mount({ plugin: 'session-gauges', surface: 'desktop', ...BAND } as never)
  const tasks = (await ui.find({ type: 'Box' }))?.text ?? ''
  expect(tasks).toContain('1 background task')
  expect(tasks).toContain('monitor (tail log)')
  expect(tasks).not.toContain('scan')
  await ui.unmount()
})
