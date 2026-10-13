import { useCallback, useEffect, useRef, useState } from 'react'

/** `done`: ticked and struck through in place; `leaving`: folding away before it joins Completed. */
export type TodoSettlePhase = 'done' | 'leaving'

// Why: a ticked task holds its place long enough to read as finished instead of vanishing.
const HOLD_MS = 900
// Covers the 180ms collapsible-up animation in main.css.
const LEAVE_MS = 220

export function useTodoCompletionSettle(): {
  phases: ReadonlyMap<string, TodoSettlePhase>
  settle: (taskId: string) => void
  cancel: (taskId: string) => void
} {
  const [phases, setPhases] = useState<ReadonlyMap<string, TodoSettlePhase>>(new Map())
  const timersRef = useRef(new Map<string, number>())

  const setPhase = useCallback((taskId: string, phase: TodoSettlePhase | null): void => {
    setPhases((current) => {
      const next = new Map(current)
      if (phase) {
        next.set(taskId, phase)
      } else {
        next.delete(taskId)
      }
      return next
    })
  }, [])

  const cancel = useCallback(
    (taskId: string): void => {
      window.clearTimeout(timersRef.current.get(taskId))
      timersRef.current.delete(taskId)
      setPhase(taskId, null)
    },
    [setPhase]
  )

  const settle = useCallback(
    (taskId: string): void => {
      const timers = timersRef.current
      window.clearTimeout(timers.get(taskId))
      setPhase(taskId, 'done')
      timers.set(
        taskId,
        window.setTimeout(() => {
          setPhase(taskId, 'leaving')
          timers.set(
            taskId,
            window.setTimeout(() => {
              timers.delete(taskId)
              setPhase(taskId, null)
            }, LEAVE_MS)
          )
        }, HOLD_MS)
      )
    },
    [setPhase]
  )

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [])

  return { phases, settle, cancel }
}
