import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), removeHandler: vi.fn() } }))
vi.mock('./fork-update', () => ({ getForkSource: () => null }))

const { markSyncSummarySeen, readUnseenSyncSummary } = await import('./fork-sync-summary')

let gitDir = ''

function writeSummary(text: string): void {
  writeFileSync(path.join(gitDir, 'orca-sync-summary.md'), text)
}

beforeEach(() => {
  gitDir = mkdtempSync(path.join(os.tmpdir(), 'fork-sync-summary-'))
})

afterEach(() => {
  rmSync(gitDir, { recursive: true, force: true })
})

describe('readUnseenSyncSummary', () => {
  it('returns the body of the summary for the running base tag', () => {
    writeSummary('# 同步上游 v1.4.226\n\n解衝突「a」\n- a.ts：x\n')
    expect(readUnseenSyncSummary(gitDir, 'v1.4.226')).toMatchObject({
      version: 'v1.4.226',
      summary: '解衝突「a」\n- a.ts：x'
    })
  })

  it('ignores a summary for a tag this build is not based on', () => {
    writeSummary('# 同步上游 v1.4.227\n\n解衝突「a」\n')
    expect(readUnseenSyncSummary(gitDir, 'v1.4.226')).toBeNull()
  })

  it('returns null without a summary file', () => {
    expect(readUnseenSyncSummary(gitDir, 'v1.4.226')).toBeNull()
  })

  it('stops returning a summary once it is marked seen, until its text changes', () => {
    writeSummary('# 同步上游 v1.4.226\n\n解衝突「a」\n')
    const first = readUnseenSyncSummary(gitDir, 'v1.4.226')
    markSyncSummarySeen(gitDir, first!.id)
    expect(readUnseenSyncSummary(gitDir, 'v1.4.226')).toBeNull()

    writeSummary('# 同步上游 v1.4.226\n\n解衝突「a」\n\n修正型別錯誤\n')
    expect(readUnseenSyncSummary(gitDir, 'v1.4.226')?.summary).toBe('解衝突「a」\n\n修正型別錯誤')
  })
})
