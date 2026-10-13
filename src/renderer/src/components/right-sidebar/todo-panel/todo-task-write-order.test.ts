import { describe, expect, it } from 'vitest'
import { beginTodoTaskWrite } from './todo-task-write-order'

describe('beginTodoTaskWrite', () => {
  it('lets only the newest write to a task repaint it', () => {
    const save = beginTodoTaskWrite('a')
    const tick = beginTodoTaskWrite('a')
    expect(tick()).toBe(true)
    expect(save()).toBe(false)
  })

  it('tracks tasks independently', () => {
    const first = beginTodoTaskWrite('b')
    const other = beginTodoTaskWrite('c')
    expect(first()).toBe(true)
    expect(other()).toBe(true)
  })
})
