import { describe, expect, it } from 'vitest'
import { BLAME_HUNK_MAX_LINES, findBlameLineHunk } from './blame-line-hunk'

describe('findBlameLineHunk', () => {
  it('returns the replaced and added lines of the change that introduced the line', () => {
    const original = 'a\n<!--expired-->\nc\n'
    const modified = 'a\n<!--expiring-->\nc\n'
    expect(findBlameLineHunk(original, modified, 2)).toEqual({
      lines: [
        { key: '-2', kind: 'removed', text: '<!--expired-->' },
        { key: '+2', kind: 'added', text: '<!--expiring-->', current: true }
      ],
      truncated: false
    })
  })

  it('picks the hunk containing the line when a commit has several', () => {
    const original = 'a\nb\nc\nd\ne\n'
    const modified = 'A\nb\nc\nd\nE\n'
    expect(findBlameLineHunk(original, modified, 5)?.lines).toEqual([
      { key: '-5', kind: 'removed', text: 'e' },
      { key: '+5', kind: 'added', text: 'E', current: true }
    ])
  })

  it('windows a large added file around the blamed line', () => {
    const modified = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join('\n')
    const hunk = findBlameLineHunk('', `${modified}\n`, 50)
    expect(hunk?.truncated).toBe(true)
    expect(hunk?.lines).toHaveLength(BLAME_HUNK_MAX_LINES)
    expect(hunk?.lines.find((line) => line.current)?.text).toBe('line 50')
  })

  it('returns null when the line is outside every change', () => {
    expect(findBlameLineHunk('a\nb\n', 'a\nB\n', 1)).toBeNull()
  })

  it('drops CRLF carriage returns from line text', () => {
    expect(findBlameLineHunk('a\r\n', 'b\r\n', 1)?.lines.map((line) => line.text)).toEqual([
      'a',
      'b'
    ])
  })
})
