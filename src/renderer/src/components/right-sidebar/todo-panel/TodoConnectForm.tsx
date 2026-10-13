import { useId, useState } from 'react'
import { ExternalLink, ListChecks, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import type {
  MicrosoftTodoFailure,
  MicrosoftTodoStatus
} from '../../../../../shared/microsoft-todo-types'
import { describeTodoFailure } from './todo-failure-copy'

const SETUP_GUIDE_URL = 'https://learn.microsoft.com/en-us/graph/auth-register-app-v2'

/** First-run setup: save the user's Entra app client ID, then sign in through the browser. */
export function TodoConnectForm(props: {
  status: MicrosoftTodoStatus
  onSaveClientId: (clientId: string) => Promise<MicrosoftTodoFailure | null>
  onSignIn: () => Promise<MicrosoftTodoFailure | null>
}): React.JSX.Element {
  const fieldId = useId()
  const [clientId, setClientId] = useState('')
  const [editingClientId, setEditingClientId] = useState(!props.status.clientIdConfigured)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (work: () => Promise<MicrosoftTodoFailure | null>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    const failure = await work()
    setBusy(false)
    setError(failure ? describeTodoFailure(failure) : null)
    return failure === null
  }

  return (
    <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5">
      <div className="space-y-1.5">
        <ListChecks className="size-7 text-muted-foreground" />
        <p className="text-sm font-medium">
          {translate('auto.components.todoPanel.connect.title', 'Connect Microsoft To Do')}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate(
            'auto.components.todoPanel.connect.description',
            'Shows the tasks you add from your phone (Reminders with your Microsoft account, or the To Do app). Sign-in stays encrypted on this computer.'
          )}
        </p>
      </div>
      {editingClientId ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() => props.onSaveClientId(clientId.trim())).then((saved) => {
              if (saved) {
                setEditingClientId(false)
              }
            })
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`${fieldId}-client`}>
              {translate(
                'auto.components.todoPanel.connect.clientIdLabel',
                'Application (client) ID'
              )}
            </Label>
            <p className="text-xs text-muted-foreground">
              {translate(
                'auto.components.todoPanel.connect.clientIdHelp',
                'From your app registration in Microsoft Entra. It is an ID, not a password.'
              )}
            </p>
          </div>
          <Input
            id={`${fieldId}-client`}
            autoFocus
            spellCheck={false}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void window.api.shell.openUrl(SETUP_GUIDE_URL)}
            >
              <ExternalLink className="size-3.5" />
              {translate('auto.components.todoPanel.connect.guide', 'Setup guide')}
            </Button>
            <Button type="submit" size="sm" disabled={busy || !clientId.trim()}>
              {translate('auto.components.todoPanel.connect.save', 'Save')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={() => void run(props.onSignIn)}
          >
            {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {busy
              ? translate(
                  'auto.components.todoPanel.connect.waiting',
                  'Finish signing in in your browser…'
                )
              : translate('auto.components.todoPanel.connect.signIn', 'Sign in with Microsoft')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={busy}
            onClick={() => setEditingClientId(true)}
          >
            {translate('auto.components.todoPanel.connect.changeClientId', 'Change application ID')}
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
