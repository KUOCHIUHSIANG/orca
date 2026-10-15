import { describe, expect, it } from 'vitest'
import { AGENT_TERM, applyZhTwTerms } from './zh-tw-locale-terms.mjs'

describe('applyZhTwTerms', () => {
  it('rewrites mainland UI vocabulary left by OpenCC', () => {
    expect(applyZhTwTerms('自定義智慧體會話', 'Custom agent session')).toBe(
      `自訂${AGENT_TERM}工作階段`
    )
    expect(applyZhTwTerms('退出登入失敗', 'Failed to sign out')).toBe('登出失敗')
  })

  it('uses the English source to resolve ambiguous words', () => {
    expect(applyZhTwTerms('GitHub 專案', 'GitHub item')).toBe('GitHub 項目')
    expect(applyZhTwTerms('篩選專案...', 'Filter projects...')).toBe('篩選專案...')
    expect(applyZhTwTerms('根據已暫存的更改生成提交資訊。', 'Generate the commit message.')).toBe(
      '根據已暫存的變更產生提交訊息。'
    )
    expect(applyZhTwTerms('應用更改', 'Apply Changes')).toBe('套用變更')
    expect(applyZhTwTerms('退出', 'Quit')).toBe('結束')
    expect(applyZhTwTerms('退出', 'Opt out')).toBe('退出')
    expect(applyZhTwTerms('測試已通過', 'Tests passed')).toBe('測試已通過')
    expect(applyZhTwTerms('通過選單報告', 'Report it from the menu')).toBe('透過選單報告')
    expect(applyZhTwTerms('看板與檔案', 'Boards and docs')).toBe('看板與文件')
    expect(applyZhTwTerms('開啟檔案', 'Open file')).toBe('開啟檔案')
    expect(applyZhTwTerms('周', 'Week')).toBe('週')
    expect(applyZhTwTerms('周圍', 'Around')).toBe('周圍')
  })

  it('swaps mainland row/column wording without breaking compounds', () => {
    expect(applyZhTwTerms('調整列大小', 'Resize column')).toBe('調整欄大小')
    expect(applyZhTwTerms('未找到行', 'Row not found')).toBe('找不到列')
    expect(applyZhTwTerms('執行此行', 'Run this row')).toBe('執行此列')
    expect(applyZhTwTerms('命令列', 'Command line')).toBe('命令列')
  })

  it('spaces inserted Latin terms only next to Han characters', () => {
    expect(applyZhTwTerms('掃描二維碼以配對', 'Scan the QR code')).toBe('掃描 QR Code 以配對')
    expect(applyZhTwTerms('建立拉取請求', 'Create pull request')).toBe('建立 Pull Request')
    expect(applyZhTwTerms('(二維碼)', 'QR code')).toBe('(QR Code)')
  })

  it('leaves interpolation placeholders untouched', () => {
    expect(applyZhTwTerms('“{{value0}}”已儲存', '"{{value0}}" saved')).toBe('「{{value0}}」已儲存')
  })
})
