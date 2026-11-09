import { Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { useAppMenuPaste } from '@/hooks/useAppMenuPaste'
import { useAppMenuSelectionActions } from '@/hooks/useAppMenuSelectionActions'
import { useAppStore } from '@/store'
import type { DetachedPage } from '../../../../shared/detached-pages'
import { detachedPageLabel } from './detached-page-labels'

const MondayCalendarPage = lazy(() => import('../monday-calendar/MondayCalendarPage'))
const MondayTaskWindow = lazy(() => import('../monday-calendar/MondayTaskWindow'))
const TodoCalendarPage = lazy(() => import('../todo-calendar/TodoCalendarPage'))
const ServerFilesPage = lazy(() => import('../server-files/ServerFilesPage'))
const SshPassphraseDialog = lazy(() =>
  import('../ssh-authentication/SshPassphraseDialog').then((module) => ({
    default: module.SshPassphraseDialog
  }))
)

/** Server sign-in prompts follow the Servers page into its window. */
function ServerCredentialPrompts(): React.JSX.Element | null {
  const pending = useAppStore((state) => state.sshCredentialQueue.length > 0)
  useEffect(() => {
    const offRequest = window.api.ssh.onCredentialRequest((data) =>
      useAppStore.getState().enqueueSshCredentialRequest(data)
    )
    const offResolved = window.api.ssh.onCredentialResolved(({ requestId }) =>
      useAppStore.getState().removeSshCredentialRequest(requestId)
    )
    return () => {
      offRequest()
      offResolved()
    }
  }, [])
  return pending ? <SshPassphraseDialog /> : null
}

export function DetachedPageRoot(props: { page: DetachedPage }): React.JSX.Element {
  const { page } = props
  // No App shell here to turn Edit-menu IPC into paste/copy on the focused field.
  useAppMenuPaste()
  useAppMenuSelectionActions()
  useTranslation()
  const title = page === 'monday-task' ? null : `${detachedPageLabel(page)} · Orca`
  useEffect(() => {
    if (title) {
      document.title = title
    }
  }, [title])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Suspense fallback={null}>
        {page === 'monday' ? <MondayCalendarPage /> : null}
        {page === 'monday-task' ? <MondayTaskWindow /> : null}
        {page === 'todo' ? <TodoCalendarPage /> : null}
        {page === 'servers' ? (
          <>
            <ServerFilesPage />
            <ServerCredentialPrompts />
          </>
        ) : null}
      </Suspense>
    </div>
  )
}
