import { describe, expect, it } from 'vitest'
import { toggleSourceSelection } from './calendar-source-selection'

describe('toggleSourceSelection', () => {
  const boards = ['1', '2', '3']

  it('unchecks one board out of "all"', () => {
    expect(toggleSourceSelection(null, boards, '2')).toEqual(['1', '3'])
  })

  it('keeps several boards checked and returns to "all" once every board is checked', () => {
    expect(toggleSourceSelection(['1'], boards, '2')).toEqual(['1', '2'])
    expect(toggleSourceSelection(['1', '2'], boards, '3')).toBeNull()
  })

  it('refuses to uncheck the last checked board', () => {
    expect(toggleSourceSelection(['2'], boards, '2')).toEqual(['2'])
  })
})
