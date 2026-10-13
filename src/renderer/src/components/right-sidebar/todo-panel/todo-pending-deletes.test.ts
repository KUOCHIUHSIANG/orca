import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelTodoDelete,
  isTodoDeletePending,
  scheduleTodoDelete,
  TODO_UNDO_WINDOW_MS
} from './todo-pending-deletes'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('todo pending deletes', () => {
  it('commits only after the undo window', () => {
    const commit = vi.fn()
    scheduleTodoDelete('t1', commit)
    expect(isTodoDeletePending('t1')).toBe(true)
    vi.advanceTimersByTime(TODO_UNDO_WINDOW_MS - 1)
    expect(commit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(commit).toHaveBeenCalledOnce()
    expect(isTodoDeletePending('t1')).toBe(false)
  })

  it('never commits once undone', () => {
    const commit = vi.fn()
    scheduleTodoDelete('t2', commit)
    expect(cancelTodoDelete('t2')).toBe(true)
    vi.advanceTimersByTime(TODO_UNDO_WINDOW_MS * 2)
    expect(commit).not.toHaveBeenCalled()
    expect(cancelTodoDelete('t2')).toBe(false)
  })
})
