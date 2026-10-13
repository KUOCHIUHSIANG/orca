import { useCallback, useEffect, useRef, useState } from 'react'
import { useMountedRef } from '@/hooks/useMountedRef'
import { readIpcErrorMessage } from '@/lib/ipc-error'
import type {
  MicrosoftTodoFailure,
  MicrosoftTodoList,
  MicrosoftTodoStatus,
  MicrosoftTodoTask
} from '../../../../../shared/microsoft-todo-types'
import { isTodoDeletePending } from './todo-pending-deletes'
import { beginTodoTaskWrite } from './todo-task-write-order'

// Why: phone edits show up within one interval without hammering Graph while the panel sits open.
const POLL_INTERVAL_MS = 5 * 60 * 1000

let cachedLists: MicrosoftTodoList[] | null = null
const cachedTasks = new Map<string, MicrosoftTodoTask[]>()

function ipcFailure(error: unknown): MicrosoftTodoFailure {
  return { ok: false, kind: 'api', message: readIpcErrorMessage(error) ?? '' }
}

export type MicrosoftTodoController = {
  status: MicrosoftTodoStatus | null
  lists: MicrosoftTodoList[] | null
  listId: string | null
  tasks: MicrosoftTodoTask[] | null
  loading: boolean
  error: MicrosoftTodoFailure | null
  pendingTaskIds: ReadonlySet<string>
  setClientId: (clientId: string) => Promise<MicrosoftTodoFailure | null>
  signIn: () => Promise<MicrosoftTodoFailure | null>
  signOut: () => void
  selectList: (listId: string) => void
  refresh: () => void
  setCompleted: (task: MicrosoftTodoTask, completed: boolean) => void
  createTask: (title: string, dueDate: string | null) => Promise<boolean>
  /** Cache-and-view writers shared with the edit/delete mutations. */
  replaceTask: (task: MicrosoftTodoTask) => void
  removeTask: (task: MicrosoftTodoTask) => void
  reportError: (failure: MicrosoftTodoFailure) => void
}

export function useMicrosoftTodo(isVisible: boolean): MicrosoftTodoController {
  const mountedRef = useMountedRef()
  const [status, setStatus] = useState<MicrosoftTodoStatus | null>(null)
  const [lists, setLists] = useState<MicrosoftTodoList[] | null>(cachedLists)
  const [listId, setListId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<MicrosoftTodoTask[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<MicrosoftTodoFailure | null>(null)
  const [pendingTaskIds, setPendingTaskIds] = useState<ReadonlySet<string>>(new Set())
  const listIdRef = useRef<string | null>(null)

  const loadTasks = useCallback(
    async (targetListId: string): Promise<void> => {
      setTasks(cachedTasks.get(targetListId) ?? null)
      const result = await window.api.microsoftTodo
        .fetchTasks({ listId: targetListId })
        .catch(ipcFailure)
      if (!mountedRef.current || listIdRef.current !== targetListId) {
        return
      }
      if (result.ok) {
        // Why: a task inside its undo window must not reappear on the next poll.
        const visible = result.tasks.filter((task) => !isTodoDeletePending(task.id))
        cachedTasks.set(targetListId, visible)
        setTasks(visible)
        setError(null)
      } else {
        setError(result)
      }
    },
    [mountedRef]
  )

  const refresh = useCallback(async (): Promise<void> => {
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
    const listsResult = await window.api.microsoftTodo.fetchLists().catch(ipcFailure)
    if (!mountedRef.current) {
      return
    }
    if (!listsResult.ok) {
      setError(listsResult)
      setLoading(false)
      // Why: a revoked sign-in is cleared in main; re-read status so the panel offers sign-in.
      if (listsResult.kind === 'signed-out') {
        setStatus(await window.api.microsoftTodo.status().catch(() => null))
      }
      return
    }
    cachedLists = listsResult.lists
    setLists(listsResult.lists)
    const preferred =
      listsResult.lists.find((list) => list.id === (listIdRef.current ?? next.selectedListId)) ??
      listsResult.lists.find((list) => list.wellKnownName === 'defaultList') ??
      listsResult.lists[0] ??
      null
    listIdRef.current = preferred?.id ?? null
    setListId(listIdRef.current)
    if (preferred) {
      await loadTasks(preferred.id)
    }
    if (mountedRef.current) {
      setLoading(false)
    }
  }, [loadTasks, mountedRef])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isVisible, refresh])

  const selectList = useCallback(
    (nextListId: string): void => {
      listIdRef.current = nextListId
      setListId(nextListId)
      void window.api.microsoftTodo.selectList({ listId: nextListId })
      void loadTasks(nextListId)
    },
    [loadTasks]
  )

  const writeTasks = useCallback(
    (
      listIdToWrite: string,
      update: (current: MicrosoftTodoTask[]) => MicrosoftTodoTask[]
    ): void => {
      const next = update(cachedTasks.get(listIdToWrite) ?? [])
      cachedTasks.set(listIdToWrite, next)
      if (mountedRef.current && listIdRef.current === listIdToWrite) {
        setTasks(next)
      }
    },
    [mountedRef]
  )

  const replaceTask = useCallback(
    (next: MicrosoftTodoTask): void =>
      writeTasks(next.listId, (current) =>
        current.some((entry) => entry.id === next.id)
          ? current.map((entry) => (entry.id === next.id ? next : entry))
          : [next, ...current]
      ),
    [writeTasks]
  )

  const removeTask = useCallback(
    (task: MicrosoftTodoTask): void =>
      writeTasks(task.listId, (current) => current.filter((entry) => entry.id !== task.id)),
    [writeTasks]
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
      // Why: an edit saved a moment earlier is already cached; build on it, not the row's copy.
      const base = cachedTasks.get(task.listId)?.find((entry) => entry.id === task.id) ?? task
      const isNewest = beginTodoTaskWrite(task.id)
      // Why: tick instantly; roll back if Microsoft refuses the change.
      replaceTask({ ...base, completed, completedAt: completed ? new Date().toISOString() : null })
      setPendingTaskIds((current) => new Set(current).add(task.id))
      void window.api.microsoftTodo
        .setTaskCompleted({ listId: task.listId, taskId: task.id, completed })
        .catch(ipcFailure)
        .then((result) => {
          const newest = isNewest()
          if (result.ok) {
            if (newest) {
              replaceTask(result.task)
            }
          } else {
            if (newest) {
              replaceTask(base)
            }
            if (mountedRef.current) {
              setError(result)
            }
          }
          if (mountedRef.current) {
            setPendingTaskIds((current) => {
              const next = new Set(current)
              next.delete(task.id)
              return next
            })
          }
        })
    },
    [mountedRef, replaceTask]
  )

  const createTask = useCallback(
    async (title: string, dueDate: string | null): Promise<boolean> => {
      const targetListId = listIdRef.current
      if (!targetListId) {
        return false
      }
      const result = await window.api.microsoftTodo
        .createTask({ listId: targetListId, title, dueDate })
        .catch(ipcFailure)
      if (!result.ok) {
        if (mountedRef.current) {
          setError(result)
        }
        return false
      }
      replaceTask(result.task)
      return true
    },
    [mountedRef, replaceTask]
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

  const signOut = useCallback((): void => {
    cachedLists = null
    cachedTasks.clear()
    setLists(null)
    setTasks(null)
    void window.api.microsoftTodo.signOut().then((next) => {
      if (mountedRef.current) {
        setStatus(next)
      }
    })
  }, [mountedRef])

  return {
    status,
    lists,
    listId,
    tasks,
    loading,
    error,
    pendingTaskIds,
    setClientId,
    signIn,
    signOut,
    selectList,
    refresh: () => void refresh(),
    setCompleted,
    createTask,
    replaceTask,
    removeTask,
    reportError
  }
}
