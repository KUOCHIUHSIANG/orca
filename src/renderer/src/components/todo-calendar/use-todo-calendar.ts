import { useCallback, useEffect, useRef, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import type {
  MicrosoftTodoFailure,
  MicrosoftTodoList,
  MicrosoftTodoStatus,
  MicrosoftTodoTask
} from '../../../../shared/microsoft-todo-types'
import { isTodoDeletePending } from '../right-sidebar/todo-panel/todo-pending-deletes'
import { sendTodoCompletion } from '../right-sidebar/todo-panel/todo-task-completion'
import {
  publishTodoTaskEvent,
  subscribeTodoTaskEvents
} from '../right-sidebar/todo-panel/todo-task-events'
import type { TodoDraft } from '../right-sidebar/todo-panel/use-microsoft-todo'

// Why: matches the sidebar panel, so phone edits appear within one interval.
const POLL_INTERVAL_MS = 5 * 60 * 1000

let cachedLists: MicrosoftTodoList[] | null = null
let cachedTasks: MicrosoftTodoTask[] | null = null

function ipcFailure(error: unknown): MicrosoftTodoFailure {
  return { ok: false, kind: 'api', message: readIpcErrorMessage(error) ?? '' }
}

export type TodoCalendarController = {
  status: MicrosoftTodoStatus | null
  lists: MicrosoftTodoList[] | null
  tasks: MicrosoftTodoTask[] | null
  loading: boolean
  error: MicrosoftTodoFailure | null
  pendingTaskIds: ReadonlySet<string>
  refresh: () => Promise<void>
  setCompleted: (task: MicrosoftTodoTask, completed: boolean) => void
  createTask: (draft: TodoDraft, listId: string) => Promise<boolean>
  replaceTask: (task: MicrosoftTodoTask) => void
  removeTask: (task: MicrosoftTodoTask) => void
  reportError: (failure: MicrosoftTodoFailure) => void
  setClientId: (clientId: string) => Promise<MicrosoftTodoFailure | null>
  signIn: () => Promise<MicrosoftTodoFailure | null>
}

/** Every list's tasks for the calendar page; `completedRange` adds finished tasks due in it. */
export function useTodoCalendar(
  completedRange: { from: string; to: string } | null
): TodoCalendarController {
  const mountedRef = useMountedRef()
  const [status, setStatus] = useState<MicrosoftTodoStatus | null>(null)
  const [lists, setLists] = useState<MicrosoftTodoList[] | null>(cachedLists)
  const [tasks, setTasks] = useState<MicrosoftTodoTask[] | null>(cachedTasks)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<MicrosoftTodoFailure | null>(null)
  const [pendingTaskIds, setPendingTaskIds] = useState<ReadonlySet<string>>(new Set())
  const rangeKey = completedRange ? `${completedRange.from}/${completedRange.to}` : ''
  const rangeKeyRef = useRef(rangeKey)
  useEffect(() => {
    rangeKeyRef.current = rangeKey
  }, [rangeKey])

  const writeTasks = useCallback(
    (update: (current: MicrosoftTodoTask[]) => MicrosoftTodoTask[]): void => {
      cachedTasks = update(cachedTasks ?? [])
      if (mountedRef.current) {
        setTasks(cachedTasks)
      }
    },
    [mountedRef]
  )

  const load = useCallback(
    async (requestedKey: string): Promise<void> => {
      setLoading(true)
      const next = await window.api.microsoftTodo.status().catch(() => null)
      if (!mountedRef.current) {
        return
      }
      setStatus(next)
      if (!next?.signedIn) {
        setLoading(false)
        return
      }
      const [from, to] = requestedKey ? requestedKey.split('/') : []
      const result = await window.api.microsoftTodo
        .fetchCalendar(from && to ? { completedFrom: from, completedTo: to } : {})
        .catch(ipcFailure)
      // Why: a later range change has already started its own fetch.
      if (!mountedRef.current || rangeKeyRef.current !== requestedKey) {
        return
      }
      setLoading(false)
      if (!result.ok) {
        setError(result)
        if (result.kind === 'signed-out') {
          setStatus(await window.api.microsoftTodo.status().catch(() => null))
        }
        return
      }
      cachedLists = result.lists
      setLists(result.lists)
      // Why: a task inside its undo window must not reappear on the next poll.
      writeTasks(() => result.tasks.filter((task) => !isTodoDeletePending(task.id)))
      setError(null)
    },
    [mountedRef, writeTasks]
  )

  useEffect(() => {
    void load(rangeKey)
    const timer = window.setInterval(() => void load(rangeKeyRef.current), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [load, rangeKey])

  const refresh = useCallback(() => load(rangeKeyRef.current), [load])

  const applyChanged = useCallback(
    (next: MicrosoftTodoTask): void =>
      writeTasks((current) =>
        current.some((entry) => entry.id === next.id)
          ? current.map((entry) => (entry.id === next.id ? next : entry))
          : [next, ...current]
      ),
    [writeTasks]
  )
  const applyRemoved = useCallback(
    (task: MicrosoftTodoTask): void =>
      writeTasks((current) => current.filter((entry) => entry.id !== task.id)),
    [writeTasks]
  )

  const [eventSource] = useState(() => Symbol('todo-calendar'))
  useEffect(
    () =>
      subscribeTodoTaskEvents(eventSource, (event) => {
        if (event.type === 'changed') {
          applyChanged(event.task)
        } else {
          applyRemoved(event.task)
        }
      }),
    [applyChanged, applyRemoved, eventSource]
  )

  const replaceTask = useCallback(
    (next: MicrosoftTodoTask): void => {
      applyChanged(next)
      publishTodoTaskEvent(eventSource, { type: 'changed', task: next })
    },
    [applyChanged, eventSource]
  )
  const removeTask = useCallback(
    (task: MicrosoftTodoTask): void => {
      applyRemoved(task)
      publishTodoTaskEvent(eventSource, { type: 'removed', task })
    },
    [applyRemoved, eventSource]
  )

  const reportError = useCallback(
    (failure: MicrosoftTodoFailure): void => {
      if (mountedRef.current) {
        setError(failure)
      }
    },
    [mountedRef]
  )

  const setCompleted = useCallback(
    (task: MicrosoftTodoTask, completed: boolean): void => {
      // Why: an edit saved a moment earlier is already cached; build on it, not the chip's copy.
      const base = cachedTasks?.find((entry) => entry.id === task.id) ?? task
      setPendingTaskIds((current) => new Set(current).add(task.id))
      void sendTodoCompletion(base, completed, replaceTask).then((failure) => {
        if (!mountedRef.current) {
          return
        }
        if (failure) {
          setError(failure)
        }
        setPendingTaskIds((current) => {
          const next = new Set(current)
          next.delete(task.id)
          return next
        })
      })
    },
    [mountedRef, replaceTask]
  )

  const createTask = useCallback(
    async (draft: TodoDraft, listId: string): Promise<boolean> => {
      const result = await window.api.microsoftTodo
        .createTask({ listId, ...draft })
        .catch(ipcFailure)
      if (!result.ok) {
        reportError(result)
        return false
      }
      replaceTask(result.task)
      return true
    },
    [replaceTask, reportError]
  )

  const setClientId = useCallback(
    async (clientId: string): Promise<MicrosoftTodoFailure | null> => {
      const result = await window.api.microsoftTodo.setClientId({ clientId }).catch(ipcFailure)
      if (result.ok && mountedRef.current) {
        setStatus(result.status)
      }
      return result.ok ? null : result
    },
    [mountedRef]
  )

  const signIn = useCallback(async (): Promise<MicrosoftTodoFailure | null> => {
    const result = await window.api.microsoftTodo.signIn().catch(ipcFailure)
    if (!result.ok) {
      return result
    }
    if (mountedRef.current) {
      setStatus(result.status)
      setError(null)
      void refresh()
    }
    return null
  }, [mountedRef, refresh])

  return {
    status,
    lists,
    tasks,
    loading,
    error,
    pendingTaskIds,
    refresh,
    setCompleted,
    createTask,
    replaceTask,
    removeTask,
    reportError,
    setClientId,
    signIn
  }
}
