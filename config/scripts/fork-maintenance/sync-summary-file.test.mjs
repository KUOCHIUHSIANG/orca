import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeSyncSummary } from './sync-summary-file.mjs'

let dir = ''
let file = ''

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'sync-summary-'))
  file = path.join(dir, 'orca-sync-summary.md')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('writeSyncSummary', () => {
  it('writes the notes under the tag header', () => {
    expect(
      writeSyncSummary({ file, targetTag: 'v1.4.226', notes: ['解衝突「a」\n- a.ts：x'] })
    ).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('# 同步上游 v1.4.226\n\n解衝突「a」\n- a.ts：x\n')
  })

  it('keeps the summary of how this tag was reached when a re-run handled nothing', () => {
    writeFileSync(file, '# 同步上游 v1.4.226\n\n解衝突「a」\n- a.ts：x\n')
    expect(writeSyncSummary({ file, targetTag: 'v1.4.226', notes: [] })).toBe(false)
    expect(readFileSync(file, 'utf8')).toBe('# 同步上游 v1.4.226\n\n解衝突「a」\n- a.ts：x\n')
  })

  it('appends a re-run’s notes to the same tag’s summary', () => {
    writeFileSync(file, '# 同步上游 v1.4.226\n\n解衝突「a」\n')
    writeSyncSummary({ file, targetTag: 'v1.4.226', notes: ['修正型別錯誤\n- b.ts：y'] })
    expect(readFileSync(file, 'utf8')).toBe(
      '# 同步上游 v1.4.226\n\n解衝突「a」\n\n修正型別錯誤\n- b.ts：y\n'
    )
  })

  it('replaces an older tag’s summary', () => {
    writeFileSync(file, '# 同步上游 v1.4.224\n\n解衝突「old」\n')
    writeSyncSummary({ file, targetTag: 'v1.4.226', notes: [] })
    expect(readFileSync(file, 'utf8')).toBe('# 同步上游 v1.4.226\n\n不需要 Claude Code 介入。\n')
  })

  it('drops the nothing-to-do line once real notes arrive', () => {
    writeFileSync(file, '# 同步上游 v1.4.226\n\n不需要 Claude Code 介入。\n')
    writeSyncSummary({ file, targetTag: 'v1.4.226', notes: ['修正型別錯誤\n- b.ts：y'] })
    expect(readFileSync(file, 'utf8')).toBe('# 同步上游 v1.4.226\n\n修正型別錯誤\n- b.ts：y\n')
  })
})
