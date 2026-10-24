// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { MondayCalendarItem, MondayUpdate } from '../../../../shared/monday-calendar-types'
import { buildMondayClaudePrompt, mondayHtmlToPlainText } from './monday-claude-prompt'

const item: MondayCalendarItem = {
  id: '1',
  name: 'Checkout flow',
  url: 'https://example.monday.com/boards/1/pulses/1',
  boardId: '10',
  boardName: 'Project Cases',
  groupId: null,
  groupTitle: null,
  parentItemName: null,
  ownerIds: [],
  startDate: null,
  endDate: null,
  statusLabel: 'Working on it',
  statusColor: null,
  isDone: false
}

function update(id: string, createdAt: string, bodyHtml: string): MondayUpdate {
  return { id, authorName: 'Heather', createdAt, bodyHtml, attachments: [], replies: [] }
}

describe('mondayHtmlToPlainText', () => {
  it('keeps paragraphs, list markers, and external link targets but drops mention links', () => {
    const html =
      '<p>Hi <a href="https://x.monday.com/users/5">@Jater</a>,</p>' +
      '<p>See <a href="https://docs.example.com">the spec</a><br>and fix:</p>' +
      '<ol><li>login</li><li>cart</li></ol><img src="https://cdn.example.com/a.png">'
    expect(mondayHtmlToPlainText(html)).toBe(
      'Hi @Jater,\n\nSee the spec (https://docs.example.com)\nand fix:\n\n1. login\n2. cart\n[Image: https://cdn.example.com/a.png]'
    )
  })
})

describe('buildMondayClaudePrompt', () => {
  const updates = [
    update('latest', '2026-10-22T09:00:00Z', '<p>latest</p>'),
    update('description', '2026-10-20T09:00:00Z', '<p>description</p>'),
    update('middle', '2026-10-21T09:00:00Z', '<p>middle</p>')
  ]

  it('sends the task with its first update as the description unless all updates are asked for', () => {
    const prompt = buildMondayClaudePrompt({
      item,
      ownerNames: [],
      updates,
      includeAllUpdates: false
    })
    expect(prompt.indexOf('Checkout flow')).toBeLessThan(prompt.indexOf('description'))
    expect(prompt).not.toContain('middle')
    expect(prompt).not.toContain('latest')
  })

  it('lists every update oldest first when all updates are included', () => {
    const prompt = buildMondayClaudePrompt({
      item,
      ownerNames: [],
      updates,
      includeAllUpdates: true
    })
    expect(prompt.indexOf('description')).toBeLessThan(prompt.indexOf('middle'))
    expect(prompt.indexOf('middle')).toBeLessThan(prompt.indexOf('latest'))
  })

  it('puts the focused update first, followed by the task and its description only', () => {
    const prompt = buildMondayClaudePrompt({
      item,
      ownerNames: [],
      updates,
      focusUpdateId: 'latest',
      includeAllUpdates: false
    })
    expect(prompt.indexOf('latest')).toBeLessThan(prompt.indexOf('Checkout flow'))
    expect(prompt.indexOf('Checkout flow')).toBeLessThan(prompt.indexOf('description'))
    expect(prompt).not.toContain('middle')
  })

  it('does not repeat the description when it is the focused update', () => {
    const prompt = buildMondayClaudePrompt({
      item,
      ownerNames: [],
      updates,
      focusUpdateId: 'description',
      includeAllUpdates: false
    })
    expect(prompt.match(/description/g)).toHaveLength(1)
  })
})
