import { describe, expect, it } from 'vitest'
import { reorderTabOrderForInsertion } from './tab-insertion'

describe('reorderTabOrderForInsertion', () => {
  const order = ['a', 'b', 'c', 'd']

  it('moves a tab forward past the hovered tab', () => {
    expect(reorderTabOrderForInsertion(order, 'a', 'c', 'right')).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderTabOrderForInsertion(order, 'a', 'c', 'left')).toEqual(['b', 'a', 'c', 'd'])
  })

  it('moves a tab backward before the hovered tab', () => {
    expect(reorderTabOrderForInsertion(order, 'd', 'a', 'left')).toEqual(['d', 'a', 'b', 'c'])
  })

  it('returns null when the drop leaves the order unchanged', () => {
    expect(reorderTabOrderForInsertion(order, 'b', 'c', 'left')).toBeNull()
    expect(reorderTabOrderForInsertion(order, 'missing', 'c', 'left')).toBeNull()
  })
})
